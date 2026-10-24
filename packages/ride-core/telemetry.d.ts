import type { RidePayload, RidePoint } from './index.js';
export type EventType = 'acceleration' | 'braking';
export type EventStatus = 'estimated' | 'inconclusive' | 'rejected';
export type EventSource = 'gps-direct' | 'gps-position' | 'assisted';
export type DetectorState =
  | 'waiting-stop'
  | 'waiting-speed'
  | 'moving'
  | 'observing'
  | 'threshold-reached'
  | 'decelerating'
  | 'stop-detected'
  | 'stop-confirmed'
  | EventStatus;
export interface EventReading {
  timestamp: number;
  speedMps: number | null;
  source: EventSource;
  segment: number;
  accuracy: number;
  latitude: number;
  longitude: number;
  calibrated: boolean;
  gpsTimestamp: number;
}
export interface PerformanceEvent {
  id: string;
  type: EventType;
  startMs: number;
  endMs: number;
  durationMs: number | null;
  status: EventStatus;
  reason: string | null;
  method: 'adjacent-linear-estimate';
  version: 'events-1';
  quality: {
    experimental: true;
    sampleCount: number;
    maxGapMs: number;
    resolutionMs: number;
    sources: EventSource[];
  };
  force: null | {
    peakG: number;
    startMs: number;
    endMs: number;
    calibrationAt: number;
    quality: 'limited';
    source: 'browser-linear';
  };
}
export interface FutureLap {
  sequence: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  validation: 'pending' | 'valid' | 'rejected';
}
export interface LapContext {
  circuitId: string | null;
  startFinishLineId: string | null;
  laps: FutureLap[];
}
export interface AdvancedTelemetry {
  version: 'events-1';
  interruptions: { timestamp: number; reason: 'speed-mode' | 'processing' }[];
  events: PerformanceEvent[];
  truncated: boolean;
  stats: {
    accelerationCount: number;
    brakingCount: number;
    bestAccelerationMs: number | null;
    bestBrakingMs: number | null;
  };
  lapContext: LapContext;
}
export const STOP_RULES: Readonly<{
  speedMps: number;
  windowMs: number;
  radiusMeters: number;
  accuracyMeters: number;
}>;
export const EVENT_RULES: Readonly<{
  accuracyMeters: number;
  gpsAgeMs: number;
  maxGapMs: number;
  crossingGapMs: number;
  thresholdMps: number;
  hysteresisMps: number;
  maxAccelerationMps2: number;
  maxSpeedMps: number;
  minSamples: number;
  maxEventMs: number;
  maxEvents: number;
}>;
export class PerformanceDetector {
  constructor(sessionId: string, config?: typeof EVENT_RULES);
  readonly events: PerformanceEvent[];
  truncated: boolean;
  states: { acceleration: DetectorState; braking: DetectorState };
  push(reading: EventReading): void;
  interrupt(reason: string, status?: EventStatus): void;
  finish(): AdvancedTelemetry;
}
export function eventReading(
  point: RidePoint,
  previous?: RidePoint,
): EventReading;
export function analyzeTelemetry(
  ride: RidePayload,
  interruptions?: AdvancedTelemetry['interruptions'],
): AdvancedTelemetry;
export function formatEventTime(event: PerformanceEvent): string;
