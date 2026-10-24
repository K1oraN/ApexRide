import type { Pool } from 'pg';
import type { RidePoint } from '@apex-ride/ride-core';
import type { MotionSample } from '@apex-ride/ride-core/motion';
import { AuthError } from '../auth/validation.js';
import { historyFields } from './history-query.js';
import { trackPreview } from '@apex-ride/ride-core/history';
import {
  gpsChart,
  assistedChart,
  motionChart,
} from '@apex-ride/ride-core/charts';
export const missing = () => new AuthError(404, 'Atividade não encontrada.');
export async function ownRide(db: Pool, id: string, owner: string) {
  const row = (
    await db.query(
      'SELECT id,mode,started_at FROM rides WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',
      [id, owner],
    )
  ).rows[0];
  if (!row) throw missing();
  return row;
}
export async function historySummary(db: Pool, id: string, owner: string) {
  const row = (
    await db.query(
      `SELECT ${historyFields},r.comparison_enabled,r.comparison_technical,r.route_snapshot,r.route_result-'laps' AS route_result,
 (SELECT count(*)::int FROM ride_points WHERE ride_id=r.id) AS point_count,
 (SELECT count(*)::int FROM ride_performance_events WHERE ride_id=r.id) AS event_count,
 (SELECT count(*)::int FROM ride_laps WHERE ride_id=r.id) AS lap_count,
 (SELECT min(duration_ms)::float8 FROM ride_laps WHERE ride_id=r.id) AS best_lap_ms,
 (SELECT json_build_object('version',m.version,'calibration',m.calibration,'stats',m.stats,'gaps',m.gaps,'truncated',m.truncated) FROM ride_motion m WHERE m.ride_id=r.id) AS motion,
 r.telemetry_summary FROM rides r WHERE r.id=$1 AND r.owner_id=$2 AND r.deleted_at IS NULL`,
      [id, owner],
    )
  ).rows[0];
  if (!row) throw missing();
  return { status: 'ok', ride: row };
}
export async function gpsPoints(db: Pool, id: string): Promise<RidePoint[]> {
  return (
    await db.query(
      `SELECT public.ST_Y(position::public.geometry) AS latitude,public.ST_X(position::public.geometry) AS longitude,extract(epoch FROM recorded_at)*1000::float8 AS timestamp,accuracy,speed,heading,altitude,segment FROM ride_points WHERE ride_id=$1 ORDER BY point_order`,
      [id],
    )
  ).rows.map((p) => ({ ...p, timestamp: Number(p.timestamp) })) as RidePoint[];
}
export async function historyTrack(
  db: Pool,
  id: string,
  owner: string,
  limit: number,
) {
  await ownRide(db, id, owner);
  return { status: 'ok', ...trackPreview(await gpsPoints(db, id), limit) };
}
export async function historyTelemetry(db: Pool, id: string, owner: string) {
  const ride = await ownRide(db, id, owner),
    start = new Date(ride.started_at).getTime();
  const [points, motion, speed] = await Promise.all([
    gpsPoints(db, id),
    db.query(
      `SELECT relative_ms::float8 AS "relativeMs",event_timestamp AS "eventTimestamp",sequence,segment,longitudinal,acceleration_g AS "accelerationG",braking_g AS "brakingG",lean,quality,source FROM ride_motion_samples WHERE ride_id=$1 ORDER BY relative_ms`,
      [id],
    ),
    db.query('SELECT speed_processing FROM rides WHERE id=$1', [id]),
  ]);
  const samples = speed.rows[0]?.speed_processing?.samples ?? [],
    advanced = ride.mode !== 'passeio';
  return {
    status: 'ok',
    series: {
      gps: gpsChart(points),
      assisted: assistedChart(samples, start, points),
      force: advanced
        ? motionChart(motion.rows as MotionSample[], start, 'force')
        : [],
      lean: advanced
        ? motionChart(motion.rows as MotionSample[], start, 'lean')
        : [],
    },
    originalCounts: {
      gps: points.length,
      motion: motion.rowCount,
      speed: samples.length,
    },
    speed: {
      version: speed.rows[0]?.speed_processing?.version ?? null,
      truncated: speed.rows[0]?.speed_processing?.truncated ?? false,
      assistedSamples: speed.rows[0]?.speed_processing
        ? samples.filter((s: { source: string }) => s.source === 'assisted')
            .length
        : null,
      gpsSamples: speed.rows[0]?.speed_processing
        ? samples.filter((s: { source: string }) => s.source === 'gps').length
        : null,
      unavailableSamples: speed.rows[0]?.speed_processing
        ? samples.filter((s: { source: string }) => s.source === 'unavailable')
            .length
        : null,
    },
  };
}
