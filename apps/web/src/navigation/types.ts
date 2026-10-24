import type { Coordinate, Line } from '@apex-ride/ride-core/routes';
export interface Maneuver {
  type: string;
  modifier: string | null;
  location: Coordinate;
  roadName: string;
  instruction: string;
  geometry: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  legIndex: number;
  along: number;
}
export interface Directions {
  geometry: Line;
  waypoints: Coordinate[];
  maneuvers: Maneuver[];
  distanceMeters: number;
  durationSeconds: number | null;
  source: 'osrm';
}
