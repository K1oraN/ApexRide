import type { Vector } from '@apex-ride/ride-core/motion';
export interface Orientation {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  monotonicMs: number;
}
export interface RawMotion {
  sequence: number;
  timestamp: number;
  monotonicMs: number;
  eventTimestamp: number;
  acceleration: Vector | null;
  gravity: Vector | null;
  angular: Vector | null;
  orientation: Orientation | null;
  interval: number | null;
  screenAngle: number | null;
}
export type SensorStatus =
  | 'idle'
  | 'requesting'
  | 'authorized'
  | 'denied'
  | 'unavailable'
  | 'waiting'
  | 'working'
  | 'insufficient'
  | 'interrupted';
export interface SensorSnapshot {
  policyWarning: string | null;
  status: SensorStatus;
  active: boolean;
  message: string;
  capabilities: { motion: boolean; orientation: boolean };
}
