import {
  acceptablePoint,
  distanceMeters,
  reliableSpeed,
  type ActiveInterval,
  type RidePayload,
  type RidePoint,
} from '@apex-ride/ride-core';
import { chartSeries, type ChartData } from '@apex-ride/ride-core/charts';
import type { MotionSample } from '@apex-ride/ride-core/motion';
import type { SpeedSample } from '@apex-ride/ride-core/speed';
import type { PerformanceEvent } from '@apex-ride/ride-core/telemetry';
import type { HistoryLap } from '../history/detail-types';

export interface ReplayInput {
  payload: RidePayload;
  laps: Pick<
    HistoryLap,
    'number' | 'start' | 'end' | 'durationMs' | 'status'
  >[];
}
export interface Timed<T> {
  time: number;
  absolute: number;
  interval: number;
  value: T;
}
export interface ReplayMark {
  id: string;
  start: number;
  end: number;
  label: string;
  status: string;
}
export interface ReplayPosition extends RidePoint {
  interpolated: boolean;
}
export const REPLAY_RULES = {
  positionGap: 5000,
  speedAge: 1500,
  sensorAge: 500,
  assistedAge: 500,
  maxInterpolationMeters: 500,
};

/** Returns the last sample at or before time; never scans a series per frame. */
export function floorIndex<T extends { time: number }>(
  series: readonly T[],
  time: number,
) {
  let low = 0,
    high = series.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (series[mid]!.time <= time) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

export function activeClock(
  start: number,
  end: number,
  input: ActiveInterval[],
) {
  const intervals: (ActiveInterval & { time: number })[] = [];
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    for (const item of input
      .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end))
      .sort((a, b) => a.start - b.start)) {
      if (!Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
      const a = Math.max(start, item.start),
        b = Math.min(end, item.end);
      if (b <= a) continue;
      const last = intervals.at(-1);
      if (last && a < last.end) last.end = Math.max(b, last.end);
      else intervals.push({ start: a, end: b, time: 0 });
    }
  }
  let duration = 0;
  for (const i of intervals) {
    i.time = duration;
    duration += i.end - i.start;
  }
  const locate = (absolute: number) => {
    if (!Number.isFinite(absolute)) return null;
    let low = 0,
      high = intervals.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (intervals[mid]!.start <= absolute) low = mid + 1;
      else high = mid;
    }
    const index = low - 1,
      i = intervals[index];
    return i && absolute <= i.end
      ? { time: i.time + absolute - i.start, interval: index }
      : null;
  };
  const elapsed =
    Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, end - start)
      : 0;
  return {
    intervals,
    duration,
    elapsed,
    paused: Math.max(0, elapsed - duration),
    locate,
  };
}

function ordered<T>(
  input: readonly T[],
  absolute: (v: T) => number,
  clock: ReturnType<typeof activeClock>,
): Timed<T>[] {
  const result: Timed<T>[] = [];
  for (const value of input
    .filter((v) => Number.isFinite(absolute(v)))
    .sort((a, b) => absolute(a) - absolute(b))) {
    const stamp = absolute(value),
      at = clock.locate(stamp);
    if (!at || result.at(-1)?.absolute === stamp) continue;
    result.push({ ...at, absolute: stamp, value });
  }
  return result;
}

/** Great-circle interpolation, restricted to short reliable arcs. Visual only. */
export function interpolatePosition(
  a: RidePoint,
  b: RidePoint,
  fraction: number,
): ReplayPosition {
  const rad = Math.PI / 180;
  const vector = (p: RidePoint) => [
    Math.cos(p.latitude * rad) * Math.cos(p.longitude * rad),
    Math.cos(p.latitude * rad) * Math.sin(p.longitude * rad),
    Math.sin(p.latitude * rad),
  ];
  const u = vector(a),
    v = vector(b);
  const angle = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        u.reduce((sum, n, i) => sum + n * v[i]!, 0),
      ),
    ),
  );
  const wa =
    angle < 1e-8
      ? 1 - fraction
      : Math.sin((1 - fraction) * angle) / Math.sin(angle);
  const wb =
    angle < 1e-8 ? fraction : Math.sin(fraction * angle) / Math.sin(angle);
  const xyz = u.map((n, i) => wa * n + wb * v[i]!);
  return {
    ...a,
    latitude: Math.atan2(xyz[2]!, Math.hypot(xyz[0]!, xyz[1]!)) / rad,
    longitude: Math.atan2(xyz[1]!, xyz[0]!) / rad,
    interpolated: true,
  };
}

export function prepareReplay({ payload: p, laps }: ReplayInput) {
  const clock = activeClock(p.startedAt, p.endedAt, p.intervals ?? []);
  const gps: Timed<RidePoint>[] = [];
  let interrupted = false,
    group = 0;
  const groups: Timed<RidePoint>[][] = [];
  for (const row of ordered(p.points, (s) => s.timestamp, clock)) {
    const prev = gps.at(-1);
    if (!acceptablePoint(row.value, prev?.value)) {
      interrupted = true;
      continue;
    }
    const continuous =
      prev &&
      !interrupted &&
      row.interval === prev.interval &&
      row.value.segment === prev.value.segment &&
      row.absolute - prev.absolute <= REPLAY_RULES.positionGap &&
      distanceMeters(prev.value, row.value) <=
        REPLAY_RULES.maxInterpolationMeters;
    if (!continuous) {
      group++;
      groups.push([]);
    }
    const normalized = { ...row, value: { ...row.value, segment: group } };
    // Keep original segment for acceptance; groups carry visual discontinuities separately.
    gps.push(row);
    groups.at(-1)!.push(normalized);
    interrupted = false;
  }
  const groupByStamp = new Map(
    groups.flatMap((g) => g.map((s) => [s.absolute, s.value.segment] as const)),
  );
  const continuous = (a: Timed<RidePoint>, b: Timed<RidePoint>) =>
    groupByStamp.get(a.absolute) === groupByStamp.get(b.absolute);
  const gaps: { start: number; end: number; reason: string }[] = [];
  for (let i = 0; i < groups.length; i++) {
    const current = groups[i]![0]!,
      previous = groups[i - 1]?.at(-1);
    const from = previous?.time ?? 0;
    if (
      current.time > from ||
      (previous && previous.interval !== current.interval)
    )
      gaps.push({
        start: from,
        end: current.time,
        reason:
          previous && previous.interval !== current.interval
            ? 'Pausa entre segmentos'
            : 'Lacuna de posição / quebra de segmento',
      });
  }
  if (gps.length && gps.at(-1)!.time < clock.duration)
    gaps.push({
      start: gps.at(-1)!.time,
      end: clock.duration,
      reason: 'Sem posição após a última amostra',
    });
  const motion = ordered(
    p.motion?.samples ?? [],
    (s) =>
      Number.isFinite(s.relativeMs) && s.relativeMs >= 0
        ? p.startedAt + s.relativeMs
        : NaN,
    clock,
  );
  const speed = ordered(
    p.speedProcessing?.samples ?? [],
    (s) =>
      Number.isFinite(s.relativeMs) && s.relativeMs >= 0
        ? p.startedAt + s.relativeMs
        : NaN,
    clock,
  );
  const gpsByStamp = new Map(gps.map((s) => [s.absolute, s]));
  const sensorGaps = ordered(
    p.motion?.gaps ?? [],
    (s) => p.startedAt + s.relativeMs,
    clock,
  );
  const calibration =
    p.motion?.version === 'motion-1' && p.motion.calibration?.valid;
  const validMotion = (s: Timed<MotionSample>) =>
    Boolean(
      calibration &&
      p.mode !== 'passeio' &&
      s.value.quality === 'limited' &&
      s.value.source === 'browser-linear' &&
      Number.isFinite(s.value.longitudinal) &&
      p.motion!.calibration!.at <= s.absolute,
    );
  const validSpeed = (s: Timed<SpeedSample>) => {
    const anchor = gpsByStamp.get(s.value.gpsTimestamp ?? -1);
    return (
      p.speedProcessing?.version === 'speed-1' &&
      anchor &&
      anchor.interval === s.interval &&
      s.absolute >= anchor.absolute &&
      s.absolute - anchor.absolute <= 1500 &&
      ((s.value.source === 'gps' &&
        ['pure-selected', 'pure-auto'].includes(s.value.state)) ||
        (s.value.source === 'assisted' && s.value.state === 'assisted')) &&
      s.value.speedMps !== null &&
      Number.isFinite(s.value.speedMps) &&
      s.value.speedMps >= 0 &&
      s.value.speedMps <= 100
    );
  };
  const mark = (
    id: string,
    a: number,
    b: number,
    label: string,
    status: string,
  ): ReplayMark[] => {
    const x = clock.locate(a),
      y = clock.locate(b);
    return x && y && x.interval === y.interval && b >= a
      ? [{ id, start: x.time, end: y.time, label, status }]
      : [];
  };
  const events = (p.telemetry?.events ?? []).flatMap((e) =>
    mark(
      e.id,
      e.startMs,
      e.endMs,
      e.type === 'acceleration'
        ? '0–100 · aceleração estimada'
        : '100–0 · frenagem estimada',
      e.status,
    ),
  );
  const lapMarks =
    p.mode === 'pista' &&
    p.route?.plan.kind === 'circuit' &&
    p.route.plan.verification === 'verified'
      ? laps.flatMap((l) =>
          mark(
            String(l.number),
            l.start,
            l.end,
            `Volta ${l.number} · ~${(l.durationMs / 1000).toFixed(1)} s`,
            l.status,
          ),
        )
      : [];
  events.sort((a, b) => a.start - b.start);
  lapMarks.sort((a, b) => a.start - b.start);
  const eventIndex = events.map((e) => ({ time: e.start, mark: e })),
    lapIndex = lapMarks.map((l) => ({ time: l.start, mark: l }));
  const currentMark = (index: typeof eventIndex, t: number) => {
    const m = index[floorIndex(index, t)]?.mark;
    return m && t <= m.end ? m : null;
  };
  const fresh = <T>(rows: Timed<T>[], time: number, age: number) => {
    const s = rows[floorIndex(rows, time)];
    // At a collapsed pause boundary select the resumed interval, never hold pre-pause data.
    const interval = floorIndex(clock.intervals, time);
    return s && s.interval === interval && time - s.time <= age ? s : null;
  };
  const frame = (time: number) => {
    const t = Number.isFinite(time)
        ? Math.max(0, Math.min(clock.duration, time))
        : 0,
      index = floorIndex(gps, t),
      a = gps[index],
      b = gps[index + 1];
    let position: ReplayPosition | null = null;
    if (a && a.interval === floorIndex(clock.intervals, t)) {
      if (a.time === t) position = { ...a.value, interpolated: false };
      else if (b && continuous(a, b))
        position = interpolatePosition(
          a.value,
          b.value,
          (t - a.time) / (b.time - a.time),
        );
    }
    const gs = fresh(gps, t, REPLAY_RULES.speedAge),
      ss = fresh(speed, t, REPLAY_RULES.assistedAge),
      ms = fresh(motion, t, REPLAY_RULES.sensorAge);
    const recorded = ss && validSpeed(ss) ? ss.value : null;
    const gpsSpeed = gs
      ? reliableSpeed(gs.value, gps[floorIndex(gps, gs.time) - 1]?.value)
      : null;
    // An explicitly unavailable processed sample must not fall back to a stale displayed value.
    const kmh = ss ? (recorded ? recorded.speedMps! * 3.6 : null) : gpsSpeed;
    const lastGap = sensorGaps[floorIndex(sensorGaps, t)];
    const sensor =
      ms && validMotion(ms) && (!lastGap || lastGap.absolute < ms.absolute)
        ? ms.value
        : null;
    const numeric = (v: number | null | undefined, max: number) =>
      v !== null && v !== undefined && Number.isFinite(v) && Math.abs(v) <= max
        ? v
        : null;
    return {
      time: t,
      position,
      gap: position === null,
      speedKmh: kmh,
      speedSource:
        recorded?.source === 'assisted'
          ? ('assisted' as const)
          : ('gps' as const),
      accelerationG: numeric(sensor?.accelerationG, 3),
      brakingG: numeric(sensor?.brakingG, 3),
      lean: numeric(sensor?.lean, 90),
      calibrated: Boolean(sensor),
      event: currentMark(eventIndex, t),
      lap: currentMark(lapIndex, t),
    };
  };
  const chart = <T>(
    rows: Timed<T>[],
    value: (s: Timed<T>, index: number) => number | null,
    gap: number,
  ) =>
    chartSeries(
      rows.map((s, i) => ({
        timestamp: s.time,
        value: value(s, i),
        segment:
          s.interval * 100000 +
          ('segment' in (s.value as object)
            ? (s.value as { segment: number }).segment
            : 0),
      })),
      gap,
    );
  const previousByStamp = new Map(
    gps.map((s, i) => [s.absolute, gps[i - 1]?.value]),
  );
  const sensorChart = (kind: 'force' | 'lean') =>
    chartSeries(
      [
        ...motion.map((s) => {
          const gap = sensorGaps[floorIndex(sensorGaps, s.time)];
          const trusted = validMotion(s) && (!gap || gap.absolute < s.absolute);
          const value = !trusted
            ? null
            : kind === 'lean'
              ? s.value.lean
              : s.value.accelerationG !== null && s.value.brakingG !== null
                ? s.value.accelerationG - s.value.brakingG
                : null;
          return {
            timestamp: s.time,
            value,
            segment: s.interval * 100000 + s.value.segment,
          };
        }),
        ...sensorGaps.map((g) => ({
          timestamp: g.time,
          value: null,
          segment: -1,
        })),
      ].sort((a, b) => a.timestamp - b.timestamp),
      500,
    );
  const charts: ChartData = {
    gps: chart(
      groups.flat(),
      (s) =>
        reliableSpeed(
          gpsByStamp.get(s.absolute)!.value,
          previousByStamp.get(s.absolute),
        ),
      REPLAY_RULES.speedAge,
    ),
    assisted: chart(
      speed,
      (s) =>
        validSpeed(s) && s.value.source === 'assisted'
          ? s.value.speedMps! * 3.6
          : null,
      500,
    ),
    force: sensorChart('force'),
    lean: sensorChart('lean'),
  };
  return {
    clock,
    gps,
    groups,
    gaps,
    charts,
    events,
    laps: lapMarks,
    frame,
    available: gps.length >= 2 && clock.duration > 0,
    originalEvents: (p.telemetry?.events ?? []) as PerformanceEvent[],
  };
}
export type ReplayTimeline = ReturnType<typeof prepareReplay>;
