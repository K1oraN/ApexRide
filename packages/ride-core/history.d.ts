import type { RidePoint } from './index.js';
export interface TrackPreview {
  segments: { segment: number; points: RidePoint[]; originalPoints: number }[];
  originalPoints: number;
  originalSegments: number;
  omittedSegments: number;
  reduced: boolean;
}
export function trackPreview(points: RidePoint[], limit?: number): TrackPreview;
