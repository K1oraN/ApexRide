import {
  validLine,
  lineLength,
  type RoutePlan,
  RouteTracker,
  LapDetector,
  validCoordinate,
} from '@apex-ride/ride-core/routes';
import type { RidePayload } from '@apex-ride/ride-core';
import type { PoolClient } from 'pg';
import { uuid } from '../rides/validation.js';
import { invalid } from './validation.js';
export function validatePlan(
  value: unknown,
): NonNullable<RidePayload['route']> {
  const b = value as NonNullable<RidePayload['route']>;
  const p = b?.plan;
  if (
    p?.waypoints !== undefined &&
    (!Array.isArray(p.waypoints) ||
      p.waypoints.length > 25 ||
      !p.waypoints.every(validCoordinate))
  )
    throw invalid('Paradas inválidas.');
  if (
    !p ||
    !uuid(p.id) ||
    !Number.isInteger(p.version) ||
    p.version < 1 ||
    typeof p.name !== 'string' ||
    p.name.length > 120 ||
    !['route', 'circuit'].includes(p.kind) ||
    !validLine(p.geometry) ||
    lineLength(p.geometry) < 1 ||
    !Number.isFinite(p.distanceMeters) ||
    p.distanceMeters <= 0 ||
    !['suggested', 'verified'].includes(p.verification) ||
    typeof b.abandoned !== 'boolean' ||
    (b.abandoned && !Number.isSafeInteger(b.abandonedAt)) ||
    (p.startLine !== null &&
      (!validLine(p.startLine) || p.startLine.coordinates.length !== 2)) ||
    (p.direction !== null && ![1, -1].includes(p.direction))
  )
    throw invalid('Associação de percurso inválida.');
  return {
    plan: {
      id: p.id,
      version: p.version,
      name: p.name,
      kind: p.kind,
      geometry: p.geometry,
      distanceMeters: p.distanceMeters,
      verification: p.verification,
      startLine: p.startLine,
      direction: p.direction,
      ...(p.waypoints ? { waypoints: p.waypoints } : {}),
    },
    abandoned: b.abandoned,
    ...(b.abandoned ? { abandonedAt: b.abandonedAt! } : {}),
  };
}
export async function persistRouteAssociation(
  c: PoolClient,
  id: string,
  payload: RidePayload,
) {
  if (!payload.route) return;
  const selection = payload.route;
  const row = (
    await c.query(
      'SELECT plan,verified_at FROM route_versions WHERE route_id=$1 AND version=$2',
      [selection.plan.id, selection.plan.version],
    )
  ).rows[0];
  if (!row) throw invalid('Versão de percurso não aprovada.');
  const plan = row.plan as RoutePlan;
  if (
    JSON.stringify(plan.geometry.coordinates) !==
    JSON.stringify(selection.plan.geometry.coordinates)
  )
    throw invalid('O percurso planejado não corresponde à versão aprovada.');
  const tracker = new RouteTracker(plan);
  const followedPoints = selection.abandoned
    ? payload.points.filter((p) => p.timestamp <= selection.abandonedAt!)
    : payload.points;
  for (const p of followedPoints) tracker.update(p);
  const progress = tracker.snapshot();
  const detector = new LapDetector(plan, payload.mode);
  if (
    selection.plan.verification === 'verified' &&
    row.verified_at &&
    payload.startedAt >= new Date(row.verified_at).getTime()
  )
    for (const p of followedPoints) detector.push(p);
  const result = {
    ...progress,
    completion: selection.abandoned
      ? 'abandoned'
      : progress.completed
        ? 'completed'
        : progress.covered > 0
          ? 'partial'
          : 'indeterminate',
    laps: detector.laps,
    inconclusiveLaps:
      detector.inconclusive + (detector.started !== null ? 1 : 0),
  };
  await c.query(
    'UPDATE rides SET route_id=$2,route_version=$3,route_snapshot=$4,route_result=$5 WHERE id=$1',
    [id, plan.id, plan.version, JSON.stringify(plan), JSON.stringify(result)],
  );
  for (const lap of detector.laps)
    await c.query(
      'INSERT INTO ride_laps(ride_id,circuit_id,route_version,lap_number,started_at,ended_at,duration_ms,status,quality) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        id,
        plan.id,
        plan.version,
        lap.number,
        new Date(lap.start),
        new Date(lap.end),
        lap.durationMs,
        lap.status,
        JSON.stringify({
          accuracy: lap.accuracy,
          method: 'gps-line-intersection-v1',
          estimated: true,
        }),
      ],
    );
}
