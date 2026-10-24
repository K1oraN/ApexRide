import type { RidePoint } from './index.js';
export type Coordinate = [number, number];
export interface Line {
  type: 'LineString';
  coordinates: Coordinate[];
}
export interface RoutePlan {
  waypoints?: Coordinate[];
  id: string;
  version: number;
  name: string;
  kind: 'route' | 'circuit';
  geometry: Line;
  distanceMeters: number;
  verification: 'suggested' | 'verified';
  startLine: Line | null;
  direction: 1 | -1 | null;
}
export interface RouteData {
  importMetadata?: {
    source: 'gpx';
    version: 1;
    altitudes: (number | null)[];
  } | null;
  name: string;
  description: string;
  city: string;
  state: string;
  category: string;
  geometry: Line;
  waypoints: Coordinate[];
  source: 'manual' | 'osrm';
  durationSeconds: number | null;
  startLine: Line | null;
  direction: 1 | -1 | null;
}
export interface RouteRecord extends RouteData, RoutePlan {
  ownerId: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'archived';
  reason: string;
  favorites: number;
  favorite: boolean;
  updatedAt: string;
}
export function validCoordinate(value: unknown): value is Coordinate;
export function validLine(value: unknown): value is Line;
export function lineLength(line: Line): number;
export function project(
  line: Line,
  point: Coordinate,
  near?: number | null,
): { distance: number; along: number; total: number };
export type RouteStatus =
  'on-route' | 'possible-deviation' | 'off-route' | 'inaccurate';
export interface RouteProgress {
  status: RouteStatus;
  covered: number;
  remaining: number;
  percent: number;
  completed: boolean;
  determinate: boolean;
}
export class RouteTracker {
  constructor(plan: RoutePlan);
  update(point: RidePoint): RouteProgress;
  snapshot(): RouteProgress;
  interrupt(): void;
}
export interface Lap {
  number: number;
  start: number;
  end: number;
  durationMs: number;
  status: 'estimated';
  accuracy: number;
}
export function detectLaps(
  plan: RoutePlan,
  points: RidePoint[],
  mode: string,
): Lap[];
export function gateCrossing(
  gate: Line,
  a: Coordinate,
  b: Coordinate,
  direction: 1 | -1,
): number | null;
export class LapDetector {
  constructor(plan: RoutePlan, mode: string);
  laps: Lap[];
  inconclusive: number;
  started: number | null;
  push(point: RidePoint): void;
  interrupt(): void;
}
