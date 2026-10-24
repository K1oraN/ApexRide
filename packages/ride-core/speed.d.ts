export type SpeedMode = 'assisted' | 'pure';
export type SpeedState =
  | 'assisted'
  | 'pure-selected'
  | 'pure-auto'
  | 'waiting'
  | 'stale'
  | 'sensor-error';
export interface SpeedSample {
  relativeMs: number;
  gpsTimestamp: number | null;
  speedMps: number | null;
  source: 'gps' | 'assisted' | 'unavailable';
  state: SpeedState;
  reason:
    | null
    | 'selected'
    | 'sensors'
    | 'calibration'
    | 'interruption'
    | 'gps-invalid'
    | 'drift'
    | 'gps-missing'
    | 'horizon';
  stationary: boolean;
}
export interface SpeedPayload {
  version: 'speed-1';
  samples: SpeedSample[];
  truncated: boolean;
}
export const SPEED_STORAGE: Readonly<{ maxSamples: number; sampleMs: number }>;
