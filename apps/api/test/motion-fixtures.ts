import {
  MOTION_RULES,
  motionStats,
  type MotionPayload,
} from '@apex-ride/ride-core/motion';
export function motionFixture(start: number): MotionPayload {
  const samples: MotionPayload['samples'] = [0, 1, 2].map((n) => ({
    sequence: n + 1,
    relativeMs: n * 200,
    eventTimestamp: n * 200,
    segment: 0,
    longitudinal: n === 2 ? -MOTION_RULES.gravity : MOTION_RULES.gravity,
    accelerationG: n === 2 ? 0 : 1,
    brakingG: n === 2 ? 1 : 0,
    lean: null,
    quality: 'limited',
    source: 'browser-linear',
  }));
  return {
    version: 'motion-1',
    calibration: {
      mount: 'top-forward',
      at: start - 1000,
      version: 'motion-1',
      valid: true,
      screenAngle: 0,
      basis: [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, 1],
      ],
      bias: [0, 0, 0],
    },
    samples,
    gaps: [],
    truncated: false,
    stats: motionStats(samples),
  };
}
