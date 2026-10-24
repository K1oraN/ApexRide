import type { RidePayload } from '@apex-ride/ride-core';
import type { VideoSegment } from '../types';

/** Part 16 restarts the recorder on pauses/camera changes: each file has its own origin.
 * Anchors are approximate JS events, never sensor/frame certified timestamps. */
export function mapMediaTime(
  segment: VideoSegment,
  ride: Pick<RidePayload, 'startedAt' | 'endedAt' | 'intervals'>,
  mediaSeconds: number,
  offsetMs = 0,
) {
  const a = segment.start;
  if (
    !a ||
    ![
      mediaSeconds,
      offsetMs,
      a.rideElapsedMs,
      a.mediaEstimatedMs,
      ride.startedAt,
      ride.endedAt,
    ].every(Number.isFinite) ||
    mediaSeconds < 0 ||
    a.rideElapsedMs < 0 ||
    a.mediaEstimatedMs < 0 ||
    (segment.end && !Number.isFinite(segment.end.rideElapsedMs)) ||
    (segment.mediaDurationMs !== null &&
      (!Number.isFinite(segment.mediaDurationMs) ||
        segment.mediaDurationMs <= 0))
  )
    return null;
  const elapsed =
    a.rideElapsedMs + mediaSeconds * 1000 - a.mediaEstimatedMs + offsetMs;
  const absolute = ride.startedAt + elapsed;
  // Do not scale time to force the recorder event duration to match encoded duration.
  if (
    absolute < ride.startedAt ||
    absolute > ride.endedAt ||
    (segment.end &&
      elapsed > segment.end.rideElapsedMs + Math.max(0, offsetMs)) ||
    (segment.mediaDurationMs !== null &&
      mediaSeconds * 1000 > segment.mediaDurationMs + 50)
  )
    return null;
  return {
    absolute,
    elapsed,
    quality: offsetMs ? ('manual' as const) : ('estimated' as const),
  };
}
