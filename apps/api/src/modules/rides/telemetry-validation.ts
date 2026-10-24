import { isDeepStrictEqual } from 'node:util';
import type { RidePayload } from '@apex-ride/ride-core';
import { RIDE_MODES } from '@apex-ride/ride-core/modes';
import {
  analyzeTelemetry,
  EVENT_RULES,
  type AdvancedTelemetry,
} from '@apex-ride/ride-core/telemetry';
import { AuthError } from '../auth/validation.js';

export function validateTelemetry(
  value: unknown,
  ride: RidePayload,
): AdvancedTelemetry {
  const fail = (): never => {
    throw new AuthError(
      400,
      'Telemetria avançada inconsistente com as medições da atividade.',
    );
  };
  if (!value || typeof value !== 'object' || !RIDE_MODES[ride.mode].advanced)
    return fail();
  const t = value as AdvancedTelemetry;
  if (
    t.version !== 'events-1' ||
    !Array.isArray(t.events) ||
    t.events.length > EVENT_RULES.maxEvents ||
    !Array.isArray(t.interruptions) ||
    t.interruptions.length > 2000
  )
    return fail();
  let last = ride.startedAt - 1;
  const interruptions = t.interruptions.map((i) => {
    if (
      !i ||
      !Number.isSafeInteger(i.timestamp) ||
      i.timestamp <= last ||
      i.timestamp > ride.endedAt ||
      !['speed-mode', 'processing'].includes(i.reason)
    )
      return fail();
    last = i.timestamp;
    return { timestamp: i.timestamp, reason: i.reason };
  });
  // Recomputes every event, its quality and session bests from validated original data.
  // Integrity verification is not physical certification of browser measurements.
  const verified = analyzeTelemetry(ride, interruptions);
  if (!isDeepStrictEqual(t, verified)) return fail();
  return verified;
}
