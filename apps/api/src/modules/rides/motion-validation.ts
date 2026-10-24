import {
  MOTION_RULES,
  motionStats,
  type Calibration,
  type MotionPayload,
  type MotionSample,
  type Vector,
} from '@apex-ride/ride-core/motion';
import type { RidePayload } from '@apex-ride/ride-core';
import { AuthError } from '../auth/validation.js';

const fail = () =>
  new AuthError(
    400,
    'Telemetria de movimento inválida, fora do período ativo ou acima do limite.',
  );
const number = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const vector = (v: unknown): v is Vector =>
  Array.isArray(v) && v.length === 3 && v.every(number);
const dot = (a: Vector, b: Vector) =>
  a.reduce((sum, v, i) => sum + v * b[i]!, 0);
function calibration(
  c: Calibration | null,
  ride: RidePayload,
): Calibration | null {
  if (c === null) return null;
  if (
    !c ||
    !['top-forward', 'right-forward'].includes(c.mount) ||
    c.version !== 'motion-1' ||
    typeof c.valid !== 'boolean' ||
    !Number.isSafeInteger(c.at) ||
    c.at > ride.startedAt ||
    c.at < ride.startedAt - 600000 ||
    (c.screenAngle !== null &&
      (!number(c.screenAngle) || ![0, 90, 180, 270].includes(c.screenAngle))) ||
    !vector(c.bias) ||
    Math.hypot(...c.bias) > 0.3 ||
    !Array.isArray(c.basis) ||
    c.basis.length !== 3 ||
    !c.basis.every(vector)
  )
    throw fail();
  const [x, y, z] = c.basis;
  if (
    c.basis.some((v) => Math.abs(Math.hypot(...v) - 1) > 0.001) ||
    Math.abs(dot(x, y)) > 0.001 ||
    Math.abs(dot(x, z)) > 0.001 ||
    Math.abs(dot(y, z)) > 0.001 ||
    Math.abs(
      x[0] * (y[1] * z[2] - y[2] * z[1]) -
        x[1] * (y[0] * z[2] - y[2] * z[0]) +
        x[2] * (y[0] * z[1] - y[1] * z[0]) -
        1,
    ) > 0.001
  )
    throw fail();
  return {
    mount: c.mount,
    at: c.at,
    version: c.version,
    valid: c.valid,
    screenAngle: c.screenAngle,
    basis: c.basis.map((v) => [...v]) as Calibration['basis'],
    bias: [...c.bias],
  };
}
export function validateMotion(
  value: unknown,
  ride: RidePayload,
): MotionPayload {
  if (!value || typeof value !== 'object') throw fail();
  const m = value as MotionPayload;
  if (
    m.version !== 'motion-1' ||
    typeof m.truncated !== 'boolean' ||
    !Array.isArray(m.samples) ||
    m.samples.length > MOTION_RULES.maxSamples ||
    !Array.isArray(m.gaps) ||
    m.gaps.length > MOTION_RULES.maxGaps
  )
    throw fail();
  const c = calibration(m.calibration, ride);
  let previous: MotionSample | undefined;
  let intervalIndex = 0;
  let previousInterval = -1;
  const samples: MotionSample[] = [];
  for (const s of m.samples) {
    if (
      !s ||
      !Number.isSafeInteger(s.sequence) ||
      s.sequence < 1 ||
      s.sequence > 2147483647 ||
      !Number.isSafeInteger(s.relativeMs) ||
      s.relativeMs < 0 ||
      s.relativeMs > ride.endedAt - ride.startedAt ||
      !number(s.eventTimestamp) ||
      s.eventTimestamp < 0 ||
      s.eventTimestamp > ride.endedAt + 5000 ||
      !Number.isSafeInteger(s.segment) ||
      s.segment < 0 ||
      s.segment > 2147483647 ||
      !['limited', 'invalid', 'uncalibrated', 'interrupted'].includes(
        s.quality,
      ) ||
      !['browser-linear', 'unavailable'].includes(s.source) ||
      s.lean !== null
    )
      throw fail();
    const time = ride.startedAt + s.relativeMs;
    while (
      intervalIndex < ride.intervals.length - 1 &&
      time > ride.intervals[intervalIndex]!.end
    )
      intervalIndex++;
    const interval = ride.intervals[intervalIndex]!;
    if (time < interval.start || time > interval.end) throw fail();
    if (
      previous &&
      (s.sequence <= previous.sequence ||
        s.relativeMs <= previous.relativeMs ||
        s.segment < previous.segment ||
        s.eventTimestamp <= previous.eventTimestamp ||
        ((intervalIndex !== previousInterval ||
          s.relativeMs - previous.relativeMs >= MOTION_RULES.gapMs) &&
          s.segment === previous.segment))
    )
      throw fail();
    if (s.quality === 'limited') {
      if (
        !c ||
        s.source !== 'browser-linear' ||
        !number(s.longitudinal) ||
        Math.abs(s.longitudinal) > 3 * MOTION_RULES.gravity ||
        !number(s.accelerationG) ||
        !number(s.brakingG) ||
        Math.abs(
          s.accelerationG - Math.max(0, s.longitudinal) / MOTION_RULES.gravity,
        ) > 0.000001 ||
        Math.abs(
          s.brakingG - Math.max(0, -s.longitudinal) / MOTION_RULES.gravity,
        ) > 0.000001
      )
        throw fail();
    } else if (
      s.longitudinal !== null ||
      s.accelerationG !== null ||
      s.brakingG !== null ||
      s.source !== 'unavailable'
    )
      throw fail();
    samples.push({
      sequence: s.sequence,
      relativeMs: s.relativeMs,
      eventTimestamp: s.eventTimestamp,
      segment: s.segment,
      longitudinal: s.longitudinal,
      accelerationG: s.accelerationG,
      brakingG: s.brakingG,
      lean: null,
      quality: s.quality,
      source: s.source,
    });
    previous = s;
    previousInterval = intervalIndex;
  }
  let lastGap = -1;
  const gaps = m.gaps.map((g) => {
    if (
      !g ||
      !Number.isSafeInteger(g.relativeMs) ||
      g.relativeMs < lastGap ||
      g.relativeMs < 0 ||
      g.relativeMs > ride.endedAt - ride.startedAt ||
      !['pause', 'signal', 'hidden'].includes(g.reason)
    )
      throw fail();
    lastGap = g.relativeMs;
    return { relativeMs: g.relativeMs, reason: g.reason };
  });
  return {
    version: m.version,
    calibration: c,
    samples,
    gaps,
    truncated: m.truncated,
    stats: motionStats(samples),
  };
}
