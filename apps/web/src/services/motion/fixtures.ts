import { MOTION_RULES, type Calibration } from '@apex-ride/ride-core/motion';
import type { RawMotion } from './types';
import { mountingBasis } from './calibration';
export const raw = (time = 0, patch: Partial<RawMotion> = {}): RawMotion => ({
  sequence: time + 1,
  timestamp: Date.now(),
  monotonicMs: time,
  eventTimestamp: time,
  acceleration: [0, 0, 0],
  gravity: [0, 0, MOTION_RULES.gravity],
  angular: [0, 0, 0],
  orientation: {
    alpha: null,
    beta: 0,
    gamma: 0,
    absolute: false,
    monotonicMs: time,
  },
  interval: 50,
  screenAngle: 0,
  ...patch,
});
export const calibrated = (): Calibration => ({
  mount: 'top-forward',
  at: Date.now(),
  version: 'motion-1',
  valid: true,
  screenAngle: 0,
  basis: mountingBasis([0, 0, MOTION_RULES.gravity], 'top-forward'),
  bias: [0, 0, 0],
});
export function emitMotion(patch: Partial<RawMotion> = {}) {
  const s = raw(performance.now(), patch);
  const toObject = (v: RawMotion['acceleration']) =>
    v ? { x: v[0], y: v[1], z: v[2] } : null;
  const event = new Event('devicemotion');
  Object.defineProperty(event, 'timeStamp', { value: s.eventTimestamp });
  Object.assign(event, {
    acceleration: toObject(s.acceleration),
    accelerationIncludingGravity: toObject(s.gravity),
    rotationRate: s.angular
      ? { beta: s.angular[0], gamma: s.angular[1], alpha: s.angular[2] }
      : null,
    interval: s.interval,
  });
  window.dispatchEvent(event);
}
