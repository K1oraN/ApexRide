import { cumulativeDistances } from '@apex-ride/ride-core';
import {
  floorIndex,
  prepareReplay,
  type ReplayInput,
} from '../../replay/timeline';
import type { VideoSegment } from '../types';
import { mapMediaTime } from './sync';

export function prepareVideoTelemetry(
  input: ReplayInput,
  bike: string | null = null,
) {
  const timeline = prepareReplay(input),
    p = input.payload;
  const distance = cumulativeDistances(timeline.gps.map((s) => s.value));
  const distances = timeline.gps.map((s, i) => ({
    time: s.absolute,
    meters: distance[i]!,
  }));
  return (segment: VideoSegment, seconds: number, offsetMs: number) => {
    const mapped = mapMediaTime(segment, p, seconds, offsetMs);
    if (!mapped) return null;
    const at = timeline.clock.locate(mapped.absolute);
    // Never resolve a collapsed pause to a pre/post pause reading.
    const frame = at ? timeline.frame(at.time) : null;
    const activeMs =
      at?.time ??
      timeline.clock.intervals.reduce(
        (n, i) => n + Math.max(0, Math.min(mapped.absolute, i.end) - i.start),
        0,
      );
    const last = distances[floorIndex(distances, mapped.absolute)];
    return {
      mapped,
      activeMs,
      frame,
      distanceMeters: last?.meters ?? null,
      mode: p.mode,
      bike,
      circuit:
        p.route?.plan.kind === 'circuit' &&
        p.route.plan.verification === 'verified'
          ? p.route.plan.name
          : null,
    };
  };
}
export type VideoTelemetryResolver = ReturnType<typeof prepareVideoTelemetry>;
export type OverlayFrame = ReturnType<VideoTelemetryResolver>;
