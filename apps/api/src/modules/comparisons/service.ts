import type { Pool } from 'pg';
import type { RidePayload, ActiveInterval } from '@apex-ride/ride-core';
import type { RoutePlan } from '@apex-ride/ride-core/routes';
import type { MotionPayload, MotionSample } from '@apex-ride/ride-core/motion';
import {
  alignActivity,
  routeReference,
  compatiblePlans,
  intersectRanges,
  timeOnRanges,
  type PositionSample,
} from '@apex-ride/ride-core/comparison';
import { trackPreview } from '@apex-ride/ride-core/history';
import { gpsPoints } from '../rides/history-data.js';
import { AuthError } from '../auth/validation.js';
import { publicConsent } from './policy.js';
import {
  derivedReference,
  splitRanges,
  type DerivedReference,
} from '../similarity/reference.js';
import { alignmentRules } from '../similarity/engine.js';

export interface RouteRow {
  id: string;
  owner_id: string;
  kind: string;
  status: string;
  verification: string;
  name: string;
  city: string;
  state: string;
  version: number;
  plan: RoutePlan | null;
}
export async function comparisonRoute(
  db: Pool,
  id: string,
  owner: string,
): Promise<RouteRow> {
  const row = (
    await db.query<RouteRow>(
      `SELECT r.id,r.owner_id,r.kind,r.status,r.verification,r.name,r.city,r.state,r.version,v.plan FROM routes r LEFT JOIN route_versions v ON v.route_id=r.id AND v.version=r.version WHERE r.id=$1 AND (r.status='approved' OR r.owner_id=$2) AND r.status<>'archived'`,
      [id, owner],
    )
  ).rows[0];
  if (!row)
    throw new AuthError(404, 'Rota inexistente, arquivada ou indisponível.');
  return row;
}
interface RideRow {
  id: string;
  owner_id: string;
  mode: string;
  visibility: string;
  comparison_revision: string;
  route_id: string;
  route_version: number;
  route_snapshot: RoutePlan;
  active_intervals: ActiveInterval[];
  started_at: Date;
  ended_at: Date;
  active_ms: string;
  paused_ms: string;
  distance_meters: number;
  average_kmh: number | null;
  maximum_kmh: number | null;
  speed_processing: RidePayload['speedProcessing'];
  motorcycle_snapshot: unknown;
  motion: Omit<MotionPayload, 'samples'> | null;
}
interface LapRow {
  number: number;
  start: number;
  end: number;
  durationMs: number;
  quality: { accuracy: number; method: string };
  status: string;
}
export async function authorizedRides(
  db: Pool,
  route: RouteRow,
  ids: string[],
  owner: string,
) {
  const result = await db.query<RideRow>(
    `SELECT r.*, (SELECT jsonb_build_object('version',m.version,'calibration',m.calibration,'stats',m.stats,'truncated',m.truncated) FROM ride_motion m WHERE m.ride_id=r.id) AS motion FROM rides r JOIN users u ON u.id=r.owner_id JOIN privacy_settings ps ON ps.user_id=r.owner_id WHERE r.id=ANY($1::uuid[]) AND r.route_id=$2 AND r.deleted_at IS NULL AND (r.owner_id=$3 OR (${publicConsent} AND r.comparison_technical AND r.mode='pista' AND $4::boolean))`,
    [
      ids,
      route.id,
      owner,
      route.kind === 'circuit' &&
        route.verification === 'verified' &&
        route.status === 'approved',
    ],
  );
  if (result.rows.length !== ids.length)
    throw new AuthError(
      404,
      'Uma atividade não está disponível para esta comparação.',
    );
  return ids.map((id) => result.rows.find((r) => r.id === id)!);
}
async function reauthorize(
  db: Pool,
  route: RouteRow,
  rides: RideRow[],
  owner: string,
) {
  const fresh = await comparisonRoute(db, route.id, owner);
  if (
    fresh.version !== route.version ||
    fresh.verification !== route.verification
  )
    throw new AuthError(409, 'A rota mudou. Refaça a comparação.');
  const rows = await authorizedRides(
    db,
    fresh,
    rides.map((r) => r.id),
    owner,
  );
  if (
    rows.some((r, i) => r.comparison_revision !== rides[i]!.comparison_revision)
  )
    throw new AuthError(
      409,
      'A privacidade mudou durante a consulta. Refaça a comparação.',
    );
}
function nearest<T>(
  items: T[],
  time: number,
  timestamp: (s: T) => number,
): T | undefined {
  let lo = 0,
    hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (timestamp(items[mid]!) < time) lo = mid + 1;
    else hi = mid;
  }
  const a = items[lo],
    b = items[lo - 1],
    best = !a
      ? b
      : !b
        ? a
        : Math.abs(timestamp(a) - time) < Math.abs(timestamp(b) - time)
          ? a
          : b;
  return best && Math.abs(timestamp(best) - time) <= 200 ? best : undefined;
}
export async function compareActivities(
  db: Pool,
  route: RouteRow,
  ids: string[],
  owner: string,
  lapNumbers?: number[],
  derived?: DerivedReference,
) {
  const started = performance.now(),
    rides = derived
      ? await ownDerivedRides(db, ids, owner)
      : await authorizedRides(db, route, ids, owner);
  // Identical approved historical versions may be compared after an edit. Never
  // silently reinterpret old data against the current geometry.
  const plan = derived?.plan ?? rides[0]!.route_snapshot;
  if (
    !plan ||
    (!derived && rides.some((r) => !compatiblePlans(plan, r.route_snapshot)))
  )
    throw new AuthError(
      422,
      'Versões de geometria, largada ou sentidos incompatíveis.',
    );
  const approved = derived
    ? { rows: [] }
    : await db.query(
        'SELECT version,plan,verified_at FROM route_versions WHERE route_id=$1 AND version=ANY($2::int[])',
        [route.id, rides.map((r) => r.route_version)],
      );
  if (
    !derived &&
    rides.some(
      (r) =>
        !approved.rows.some(
          (v) =>
            v.version === r.route_version &&
            compatiblePlans(v.plan as RoutePlan, r.route_snapshot),
        ),
    )
  )
    throw new AuthError(422, 'Versão de geometria não aprovada.');
  if (
    rides.some((r) => r.owner_id !== owner) &&
    (!route.plan ||
      !compatiblePlans(plan, route.plan) ||
      rides.some(
        (r) =>
          r.route_snapshot.verification !== 'verified' ||
          !approved.rows.some(
            (v) =>
              v.version === r.route_version &&
              v.verified_at &&
              r.started_at >= v.verified_at,
          ),
      ))
  )
    throw new AuthError(
      422,
      'O circuito exige geometria e verificação vigentes na data da atividade.',
    );
  if (
    lapNumbers &&
    rides.some(
      (r) =>
        r.mode !== 'pista' || !route.plan || !compatiblePlans(plan, route.plan),
    )
  )
    throw new AuthError(
      422,
      'Voltas exigem Modo Pista, sentido e geometria vigentes.',
    );
  const count = await db.query(
    'SELECT count(*)::int AS n FROM ride_points WHERE ride_id=ANY($1::uuid[])',
    [ids],
  );
  if (count.rows[0].n > 200000)
    throw new AuthError(
      422,
      'Quantidade de pontos excede o limite de processamento.',
    );
  let reference: ReturnType<typeof routeReference>;
  try {
    reference = derived ? derivedReference(derived) : routeReference(plan);
  } catch (e) {
    throw new AuthError(422, (e as Error).message);
  }
  const data: {
    r: RideRow;
    alignment: ReturnType<typeof alignActivity>;
    samples: (PositionSample & {
      assisted: number | null;
      force: number | null;
      lean: number | null;
    })[];
    events: unknown[];
    laps: LapRow[];
    lap: LapRow | undefined;
    track: ReturnType<typeof trackPreview>;
  }[] = [];
  for (const [i, r] of rides.entries()) {
    if (performance.now() - started > 8000)
      throw new AuthError(
        503,
        'Tempo de processamento excedido. Tente menos atividades.',
      );
    const points = await gpsPoints(db, r.id),
      begin = r.started_at.getTime();
    const laps = (
      await db.query<LapRow>(
        `SELECT lap_number AS number,(extract(epoch FROM started_at)*1000)::float8 AS start,(extract(epoch FROM ended_at)*1000)::float8 AS end,duration_ms::float8 AS "durationMs",quality,status FROM ride_laps WHERE ride_id=$1 ORDER BY lap_number LIMIT 501`,
        [r.id],
      )
    ).rows;
    const lap = lapNumbers
      ? laps.find((l) => l.number === lapNumbers[i])
      : undefined;
    if (
      lapNumbers &&
      (!lap ||
        lap.status !== 'estimated' ||
        !Number.isFinite(lap.quality?.accuracy) ||
        lap.quality.accuracy > 20 ||
        lap.quality.method !== 'gps-line-intersection-v1')
    )
      throw new AuthError(
        422,
        'Volta ausente, inconclusiva ou com método/qualidade incompatível.',
      );
    const eligible = derived
      ? points.flatMap((p) => {
          const window = derived.windows[r.id]!.findIndex(
            ([a, b]) => p.timestamp >= a - 1 && p.timestamp <= b + 1,
          );
          return window < 0
            ? []
            : [{ ...p, segment: p.segment + window * 100000 }];
        })
      : lap
        ? points.filter(
            (p) => p.timestamp >= lap.start && p.timestamp <= lap.end,
          )
        : points;
    let alignment: ReturnType<typeof alignActivity>;
    try {
      alignment = alignActivity(
        reference,
        {
          plan: derived?.plan ?? r.route_snapshot,
          points: eligible,
          intervals: r.active_intervals,
          startedAt: lap ? lap.start : begin,
        },
        derived ? alignmentRules : undefined,
      );
    } catch (e) {
      throw new AuthError(422, (e as Error).message);
    }
    const sensors = (
      await db.query<MotionSample>(
        `SELECT relative_ms::float8 AS "relativeMs",segment,longitudinal,acceleration_g AS "accelerationG",braking_g AS "brakingG",lean,quality,source FROM ride_motion_samples WHERE ride_id=$1 ORDER BY relative_ms`,
        [r.id],
      )
    ).rows;
    const events =
      r.mode === 'passeio' || derived
        ? []
        : (
            await db.query(
              `SELECT type,duration_ms::float8 AS "durationMs",status,method,version,quality,CASE WHEN force IS NULL THEN NULL ELSE jsonb_build_object('peakG',force->'peakG','quality',force->'quality','source',force->'source') END AS force FROM ride_performance_events WHERE ride_id=$1 ${lap ? 'AND start_ms>=$2 AND end_ms<=$3' : ''} ORDER BY start_ms LIMIT 200`,
              lap ? [r.id, lap.start, lap.end] : [r.id],
            )
          ).rows;
    const samples = alignment.samples.map((s) => {
      const time = (lap ? lap.start : begin) + s.elapsedMs - begin,
        m = nearest(sensors, time, (m) => m.relativeMs),
        speed = nearest(
          r.speed_processing?.samples ?? [],
          time,
          (s) => s.relativeMs,
        );
      const calibrated =
        r.mode !== 'passeio' &&
        r.motion?.calibration?.valid &&
        m?.quality === 'limited' &&
        m.source === 'browser-linear';
      return {
        ...s,
        assisted:
          speed?.source === 'assisted' &&
          speed.state === 'assisted' &&
          speed.speedMps !== null &&
          speed.gpsTimestamp !== null &&
          Math.abs(begin + time - speed.gpsTimestamp) <= 1000
            ? speed.speedMps * 3.6
            : null,
        force:
          calibrated &&
          m.longitudinal !== null &&
          m.accelerationG !== null &&
          m.brakingG !== null
            ? m.accelerationG - m.brakingG
            : null,
        lean: calibrated ? m.lean : null,
      };
    });
    let mapSegment = 0;
    const displayPoints = derived ? points : eligible;
    const mapPoints = displayPoints.map((p, i) => {
      const previous = displayPoints[i - 1];
      if (
        previous &&
        (p.segment !== previous.segment ||
          p.timestamp - previous.timestamp >= 10000 ||
          p.timestamp <= previous.timestamp ||
          p.accuracy > 20 ||
          previous.accuracy > 20)
      )
        mapSegment++;
      return { ...p, segment: mapSegment };
    });
    const track = trackPreview(mapPoints, 1200);
    data.push({
      r,
      alignment,
      samples,
      events,
      laps: lap ? [lap] : laps.slice(0, 500),
      lap,
      track,
    });
  }
  const intersection = intersectRanges(data.map((d) => d.alignment.ranges));
  const ranges = derived ? splitRanges(intersection, derived) : intersection,
    commonMeters = ranges.reduce((sum, [a, b]) => sum + b - a, 0);
  const states = data.map((d) => d.alignment.state),
    state =
      states.includes('none') || commonMeters < 1
        ? 'none'
        : states.includes('limited')
          ? 'limited'
          : (!derived || derived.classification === 'full') &&
              states.every((s) => s === 'full') &&
              commonMeters / reference.total >= 0.95
            ? 'full'
            : 'partial';
  const motionCompatible = rides.every(
    (r) =>
      r.motion?.calibration?.valid &&
      !r.motion.truncated &&
      r.motion.version === rides[0]!.motion?.version &&
      r.motion.calibration.mount === rides[0]!.motion?.calibration?.mount,
  );
  const speedCompatible = rides.every(
    (r) =>
      r.speed_processing?.version &&
      r.speed_processing.version === rides[0]!.speed_processing?.version &&
      !r.speed_processing.truncated,
  );
  const activities = data.map((d) => {
    const { r, alignment } = d,
      own = r.owner_id === owner;
    return {
      id: r.id,
      own,
      label: own
        ? new Date(r.started_at).toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
          })
        : 'Sessão de pista autorizada',
      bike: r.motorcycle_snapshot,
      mode: r.mode,
      routeVersion: r.route_version,
      state: alignment.state,
      coverage: alignment.coverage,
      issues: alignment.issues,
      summary: {
        distanceMeters: r.distance_meters,
        routeMeters: reference.total,
        extraMeters: r.distance_meters - reference.total,
        activeMs: Number(r.active_ms),
        elapsedMs: r.ended_at.getTime() - r.started_at.getTime(),
        pausedMs: Number(r.paused_ms),
        averageKmh: r.average_kmh,
        maximumKmh: r.maximum_kmh,
        commonActiveMs:
          commonMeters > 0
            ? timeOnRanges(alignment, ranges, reference.total)
            : null,
        commonAverageKmh:
          commonMeters > 0 &&
          timeOnRanges(alignment, ranges, reference.total) > 0
            ? (commonMeters /
                timeOnRanges(alignment, ranges, reference.total)) *
              3600
            : null,
        commonMaximumKmh: (() => {
          const speeds = alignment.observations
            .filter((o) =>
              ranges.some(([a, b]) => o.along >= a && o.along <= b),
            )
            .flatMap((o) => (o.gps === null ? [] : [o.gps]));
          return speeds.length ? speeds.reduce((a, b) => Math.max(a, b)) : null;
        })(),
        lapMs: d.lap?.durationMs ?? null,
        motion: motionCompatible && !derived ? (r.motion?.stats ?? null) : null,
      },
      methods: {
        gps: 'GPS original validado; versão histórica do cálculo não registrada',
        assisted: r.speed_processing?.version ?? null,
        motion: r.motion?.version ?? null,
        calibrated: r.motion?.calibration?.valid ?? false,
      },
      samples: d.samples
        .filter(
          (s) =>
            !derived || ranges.some(([a, b]) => s.meters >= a && s.meters <= b),
        )
        .map((s) => ({
          ...s,
          assisted: speedCompatible ? s.assisted : null,
          force: motionCompatible ? s.force : null,
          lean: motionCompatible ? s.lean : null,
        })),
      track: own
        ? d.track.segments.map((g) =>
            g.points.map((p) => [p.longitude, p.latitude]),
          )
        : [],
      trackReduced: own ? d.track.reduced : false,
      events: d.events,
      laps: d.laps.map((l) => ({
        number: l.number,
        durationMs: l.durationMs,
        quality: l.quality,
        status: l.status,
      })),
    };
  });
  const differences = activities.map((a, i) => ({
    id: a.id,
    commonTimeMs:
      state !== 'none' && a.summary.commonActiveMs !== null
        ? a.summary.commonActiveMs - activities[0]!.summary.commonActiveMs!
        : null,
    distanceMeters:
      state === 'full'
        ? a.summary.distanceMeters - activities[0]!.summary.distanceMeters
        : null,
    activeMs:
      state === 'full'
        ? a.summary.activeMs - activities[0]!.summary.activeMs
        : null,
    lapMs:
      lapNumbers && state !== 'none'
        ? data[i]!.lap!.durationMs - data[0]!.lap!.durationMs
        : null,
  }));
  if (derived) await ownDerivedRides(db, ids, owner);
  else await reauthorize(db, route, rides, owner);
  return {
    version: 'comparison-1',
    referenceSource: derived ? 'gps-common' : 'registered-route',
    referenceVersion: derived?.version ?? null,
    state,
    route: {
      id: route.id,
      name: route.name,
      city: route.city,
      state: route.state,
      plan,
    },
    commonMeters,
    commonRanges: ranges,
    sections: ranges.slice(0, 100).map((range) => ({
      from: range[0],
      to: range[1],
      activeMs: data.map((d) =>
        timeOnRanges(d.alignment, [range], reference.total),
      ),
    })),
    commonGeometry: ranges
      .slice(0, 800)
      .map((r) => reference.section(r))
      .filter((l) => l.coordinates.length >= 2),
    activities,
    differences,
    limitations: [
      ...(!motionCompatible
        ? [
            'G/inclinação sem calibração e método compatíveis em todas as atividades; diferenças indisponíveis.',
          ]
        : []),
      ...(!speedCompatible
        ? ['GPS Assistido sem versões compatíveis; compare o GPS validado.']
        : []),
      'Inclinação depende dos sensores; o esquema atual não registra inclinação dinâmica.',
      'As estatísticas GPS históricas não registram versão do cálculo; sua origem é conhecida, mas equivalência entre futuras versões exige validação.',
      'Mapa reduzido apenas para exibição. Lacunas e desvios não são interpolados.',
      ...(derived
        ? [
            'Referência GPS derivada: totais históricos são apenas contexto. Estatísticas de sensores totais e eventos não são comparados; séries e tempos usam somente trechos comuns.',
          ]
        : []),
    ],
  };
}

async function ownDerivedRides(db: Pool, ids: string[], owner: string) {
  const rows = await db.query<RideRow>(
    `SELECT r.*, (SELECT jsonb_build_object('version',m.version,'calibration',m.calibration,'stats',m.stats,'truncated',m.truncated) FROM ride_motion m WHERE m.ride_id=r.id) AS motion FROM rides r WHERE r.id=ANY($1::uuid[]) AND r.owner_id=$2 AND r.deleted_at IS NULL`,
    [ids, owner],
  );
  if (rows.rows.length !== ids.length)
    throw new AuthError(404, 'Atividade indisponível.');
  return ids.map((id) => rows.rows.find((r) => r.id === id)!);
}
