import type { Pool } from 'pg';
import { ownRide, missing } from './history-data.js';
import { AuthError } from '../auth/validation.js';

/** Original samples, paginated separately from the reduced History previews. */
export async function replayData(
  db: Pool,
  id: string,
  owner: string,
  query: Record<string, unknown>,
) {
  await ownRide(db, id, owner);
  if (
    Object.keys(query).some((key) => !['kind', 'page', 'limit'].includes(key))
  )
    throw new AuthError(400, 'Consulta de replay inválida.');
  const kind = query.kind ?? 'meta';
  if (!['meta', 'gps', 'motion', 'speed'].includes(kind as string))
    throw new AuthError(400, 'Série de replay inválida.');
  const integer = (raw: unknown, fallback: number, max: number) => {
    const n = raw === undefined ? fallback : Number(raw);
    if (
      (raw !== undefined && typeof raw !== 'string') ||
      !Number.isSafeInteger(n) ||
      n < 1 ||
      n > max
    )
      throw new AuthError(400, 'Paginação de replay inválida.');
    return n;
  };
  const page = integer(query.page, 1, 10000),
    limit = integer(query.limit, 1000, 2000),
    offset = (page - 1) * limit;
  if (kind === 'meta') {
    const result = await db.query(
      `SELECT r.client_id AS "clientId",r.motorcycle_id AS "motorcycleId",r.mode,r.visibility,
      (extract(epoch FROM r.started_at)*1000)::float8 AS "startedAt",(extract(epoch FROM r.ended_at)*1000)::float8 AS "endedAt",r.active_intervals AS intervals,
      CASE WHEN r.route_snapshot IS NULL THEN NULL ELSE jsonb_build_object('plan',r.route_snapshot,'abandoned',COALESCE((r.route_result->>'completion')='abandoned',false)) END AS route,
      (SELECT jsonb_build_object('version',m.version,'calibration',m.calibration,'gaps',m.gaps,'stats',m.stats,'truncated',m.truncated,'samples','[]'::jsonb) FROM ride_motion m WHERE m.ride_id=r.id) AS motion,
      CASE WHEN r.speed_processing IS NULL THEN NULL ELSE (r.speed_processing-'samples')||'{"samples":[]}'::jsonb END AS "speedProcessing",
      CASE WHEN r.telemetry_summary IS NULL THEN NULL ELSE r.telemetry_summary||'{"events":[]}'::jsonb END AS telemetry
      FROM rides r WHERE r.id=$1 AND r.owner_id=$2 AND r.deleted_at IS NULL`,
      [id, owner],
    );
    if (!result.rows.length) throw missing();
    return {
      status: 'ok',
      version: 'replay-1',
      payload: { ...result.rows[0], points: [] },
    };
  }
  const result =
    kind === 'gps'
      ? await db.query(
          `SELECT public.ST_Y(position::public.geometry) AS latitude,public.ST_X(position::public.geometry) AS longitude,(extract(epoch FROM recorded_at)*1000)::float8 AS timestamp,accuracy,speed,heading,altitude,segment FROM ride_points WHERE ride_id=$1 ORDER BY recorded_at,point_order LIMIT $2 OFFSET $3`,
          [id, limit + 1, offset],
        )
      : kind === 'motion'
        ? await db.query(
            `SELECT relative_ms::float8 AS "relativeMs",event_timestamp AS "eventTimestamp",sequence,segment,longitudinal,acceleration_g AS "accelerationG",braking_g AS "brakingG",lean,quality,source FROM ride_motion_samples WHERE ride_id=$1 ORDER BY relative_ms,sequence LIMIT $2 OFFSET $3`,
            [id, limit + 1, offset],
          )
        : await db.query(
            `SELECT r.speed_processing->'samples'->n AS sample FROM rides r CROSS JOIN LATERAL generate_series($3::int,LEAST($3::int+$2::int-1,jsonb_array_length(COALESCE(r.speed_processing->'samples','[]'::jsonb))-1)) AS n WHERE r.id=$1`,
            [id, limit + 1, offset],
          );
  const items =
    kind === 'speed' ? result.rows.map((r) => r.sample) : result.rows;
  return {
    status: 'ok',
    items: items.slice(0, limit),
    page,
    hasMore: items.length > limit,
  };
}
