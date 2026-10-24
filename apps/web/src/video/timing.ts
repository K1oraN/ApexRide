import type { RideSnapshot } from '../ride/controller';
import type { VideoAnchor } from './types';
export function videoAnchor(
  snapshot: RideSnapshot,
  wallMs = Date.now(),
  monotonicMs = performance.now(),
  mediaEstimatedMs = 0,
): VideoAnchor {
  const activity = snapshot.activity;
  if (
    !activity ||
    !Number.isFinite(wallMs) ||
    !Number.isFinite(monotonicMs) ||
    wallMs < activity.payload.startedAt
  )
    throw new Error('Referência temporal do vídeo indisponível.');
  const end = Math.min(wallMs, activity.payload.endedAt || wallMs);
  const active =
    activity.payload.intervals.reduce(
      (n, i) => n + Math.max(0, Math.min(end, i.end) - i.start),
      0,
    ) +
    (activity.activeStart === null
      ? 0
      : Math.max(0, end - activity.activeStart));
  return {
    wallMs,
    monotonicMs,
    rideElapsedMs: end - activity.payload.startedAt,
    rideActiveMs: active,
    mediaEstimatedMs,
  };
}
