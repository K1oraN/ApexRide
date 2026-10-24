export interface RidePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  segment: number;
}
export interface ActiveInterval {
  start: number;
  end: number;
}
export interface RidePayload {
  event?: { id: string; authorizationId: string };
  route?: {
    plan: import('./routes.js').RoutePlan;
    abandoned: boolean;
    abandonedAt?: number;
  };
  telemetry?: import('./telemetry.js').AdvancedTelemetry;
  speedProcessing?: import('./speed.js').SpeedPayload;
  motion?: import('./motion.js').MotionPayload;
  clientId: string;
  motorcycleId: string;
  mode: 'passeio' | 'pista' | 'misto';
  visibility: 'public' | 'private';
  startedAt: number;
  endedAt: number;
  intervals: ActiveInterval[];
  points: RidePoint[];
}
export interface RideMetrics {
  elapsedMs: number;
  activeMs: number;
  pausedMs: number;
  distanceMeters: number;
  averageKmh: number | null;
  maximumKmh: number | null;
}
export const RIDE_RULES: Readonly<{
  maxPoints: number;
  maxIntervals: number;
  maxDurationMs: number;
  gapMs: number;
  accuracyMeters: number;
  maxSpeedMps: number;
  maxAccelerationMps2: number;
  minMovementMeters: number;
}>;
export function distanceMeters(
  a: Pick<RidePoint, 'latitude' | 'longitude'>,
  b: Pick<RidePoint, 'latitude' | 'longitude'>,
): number;
export function validPoint(p: RidePoint): boolean;
export function acceptablePoint(
  p: RidePoint,
  previous: RidePoint | undefined,
): boolean;
export function reliableSpeed(
  p: RidePoint,
  previous: RidePoint | undefined,
): number | null;
export function calculateMetrics(
  start: number,
  end: number,
  intervals: ActiveInterval[],
  points: RidePoint[],
): RideMetrics;
export function cumulativeDistances(points: RidePoint[]): number[];
