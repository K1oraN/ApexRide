import type { RidePoint, ActiveInterval } from './index.js';
import type { RoutePlan } from './routes.js';
export const COMPARISON_RULES: Readonly<{
  version: string;
  maxActivities: number;
  minParticipants: number;
  accuracyMeters: number;
  corridorMeters: number;
  gapMs: number;
  gridMeters: number;
  maxSamples: number;
  maxIndexEntries: number;
  maxProcessingMs: number;
}>;
export const BIKE_CATEGORIES: string[];
export const CC_BANDS: number[][];
export type ComparisonState = 'full' | 'partial' | 'limited' | 'none';
export const COMPARISON_STATES: Record<ComparisonState, string>;
export function compatiblePlans(
  a: RoutePlan | null,
  b: RoutePlan | null,
): boolean;
export type Range = [number, number];
export function intersectRanges(lists: Range[][]): Range[];
export interface Observation {
  p: RidePoint;
  along: number;
  chain: number;
  interval: number;
  gps: number | null;
}
export interface PositionSample {
  meters: number;
  elapsedMs: number;
  segmentMs: number;
  gps: number | null;
  chain: number;
  lap: number;
}
export interface Alignment {
  state: ComparisonState;
  issues: string[];
  coverage: number;
  ranges: Range[];
  edges: { a: Observation; b: Observation }[];
  samples: PositionSample[];
  observations: Observation[];
}
export function routeReference(
  plan: RoutePlan,
  rules?: typeof COMPARISON_RULES,
): {
  plan: RoutePlan;
  total: number;
  section: (range: Range) => import('./routes.js').Line;
  candidates: (point: RidePoint) => {
    along: number;
    offset: number;
    dx: number;
    dy: number;
    index: number;
  }[];
};
export function alignActivity(
  reference: ReturnType<typeof routeReference>,
  input: {
    plan: RoutePlan | null;
    points: RidePoint[];
    intervals: ActiveInterval[];
    startedAt: number;
  },
  rules?: typeof COMPARISON_RULES,
): Alignment;
export function timeOnRanges(
  alignment: Alignment,
  ranges: Range[],
  total: number,
): number;
