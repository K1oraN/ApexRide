import type { RidePayload } from '@apex-ride/ride-core';
import {
  SPEED_STORAGE,
  type SpeedPayload,
  type SpeedSample,
} from '@apex-ride/ride-core/speed';
import { AuthError } from '../auth/validation.js';

export function validateSpeed(value: unknown, ride: RidePayload): SpeedPayload {
  const fail = (): never => {
    throw new AuthError(400, 'Série de velocidade inválida.');
  };
  if (!value || typeof value !== 'object') return fail();
  const p = value as SpeedPayload;
  if (
    p.version !== 'speed-1' ||
    typeof p.truncated !== 'boolean' ||
    !Array.isArray(p.samples) ||
    p.samples.length > SPEED_STORAGE.maxSamples
  )
    return fail();
  const gps = new Map(ride.points.map((point) => [point.timestamp, point]));
  let last = -1;
  let intervalIndex = 0;
  const samples = p.samples.map((s): SpeedSample => {
    if (
      !s ||
      !Number.isSafeInteger(s.relativeMs) ||
      s.relativeMs <= last ||
      s.relativeMs < 0 ||
      s.relativeMs > ride.endedAt - ride.startedAt
    )
      return fail();
    const at = ride.startedAt + s.relativeMs;
    while (
      intervalIndex < ride.intervals.length - 1 &&
      at > ride.intervals[intervalIndex]!.end
    )
      intervalIndex++;
    const interval = ride.intervals[intervalIndex]!;
    if (at < interval.start || at > interval.end) return fail();
    last = s.relativeMs;
    if (
      ![
        'assisted',
        'pure-selected',
        'pure-auto',
        'waiting',
        'stale',
        'sensor-error',
      ].includes(s.state) ||
      !['gps', 'assisted', 'unavailable'].includes(s.source) ||
      ![
        null,
        'selected',
        'sensors',
        'calibration',
        'interruption',
        'gps-invalid',
        'drift',
        'gps-missing',
        'horizon',
      ].includes(s.reason) ||
      typeof s.stationary !== 'boolean'
    )
      return fail();
    if (
      s.speedMps !== null &&
      (typeof s.speedMps !== 'number' ||
        !Number.isFinite(s.speedMps) ||
        s.speedMps < 0 ||
        s.speedMps > 100)
    )
      return fail();
    const ref = s.gpsTimestamp === null ? undefined : gps.get(s.gpsTimestamp);
    if (
      s.gpsTimestamp !== null &&
      (!Number.isSafeInteger(s.gpsTimestamp) ||
        !ref ||
        s.gpsTimestamp > at ||
        s.gpsTimestamp < interval.start)
    )
      return fail();
    if (s.source === 'unavailable') {
      if (
        s.speedMps !== null ||
        !['waiting', 'stale'].includes(s.state) ||
        s.stationary
      )
        return fail();
    } else {
      if (
        s.speedMps === null ||
        !ref ||
        ref.speed === null ||
        at - ref.timestamp > (s.source === 'assisted' ? 2000 : 3000)
      )
        return fail();
      if (
        s.source === 'gps' &&
        (s.speedMps !== ref.speed ||
          !['pure-selected', 'pure-auto', 'sensor-error'].includes(s.state) ||
          s.stationary)
      )
        return fail();
      if (
        s.source === 'assisted' &&
        (s.state !== 'assisted' ||
          s.reason !== null ||
          Math.abs(s.speedMps - ref.speed) > 5 ||
          (s.stationary && s.speedMps !== 0))
      )
        return fail();
    }
    return {
      relativeMs: s.relativeMs,
      gpsTimestamp: s.gpsTimestamp,
      speedMps: s.speedMps,
      source: s.source,
      state: s.state,
      reason: s.reason,
      stationary: s.stationary,
    };
  });
  return { version: 'speed-1', samples, truncated: p.truncated };
}
