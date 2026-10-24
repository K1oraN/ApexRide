export type Vector = [number, number, number];
export type Mount = 'top-forward' | 'right-forward';
export interface Calibration {
  mount: Mount;
  at: number;
  version: 'motion-1';
  valid: boolean;
  screenAngle: number | null;
  basis: [Vector, Vector, Vector];
  bias: Vector;
}
export interface MotionSample {
  sequence: number;
  relativeMs: number;
  eventTimestamp: number;
  segment: number;
  longitudinal: number | null;
  accelerationG: number | null;
  brakingG: number | null;
  lean: number | null;
  quality: 'limited' | 'uncalibrated' | 'invalid' | 'interrupted';
  source: 'browser-linear' | 'unavailable';
}
export interface MotionStats {
  maxAccelerationG: number | null;
  maxBrakingG: number | null;
  maxLeft: number | null;
  maxRight: number | null;
  meanLeft: number | null;
  meanRight: number | null;
  validSamples: number;
}
export interface MotionPayload {
  version: 'motion-1';
  calibration: Calibration | null;
  samples: MotionSample[];
  gaps: { relativeMs: number; reason: 'pause' | 'signal' | 'hidden' }[];
  truncated: boolean;
  stats: MotionStats;
}
export const MOTION_RULES: Readonly<{
  gravity: number;
  sampleMs: number;
  gapMs: number;
  maxSamples: number;
  maxGaps: number;
}>;
export function motionStats(samples: MotionSample[]): MotionStats;
