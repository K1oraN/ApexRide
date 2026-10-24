import type { RidePoint } from './index.js';
import type { MotionSample } from './motion.js';
import type { SpeedSample } from './speed.js';
export interface ChartPoint {
  timestamp: number;
  value: number;
  segment: number;
}
export interface ChartData {
  gps: ChartPoint[];
  assisted: ChartPoint[];
  force: ChartPoint[];
  lean: ChartPoint[];
}
export function chartSeries(
  input: { timestamp: number; value: number | null; segment: number }[],
  gapMs: number,
  limit?: number,
): ChartPoint[];
export function gpsChart(points: RidePoint[]): ChartPoint[];
export function assistedChart(
  samples: SpeedSample[],
  start: number,
  points?: RidePoint[],
): ChartPoint[];
export function motionChart(
  samples: MotionSample[],
  start: number,
  kind: 'force' | 'lean',
): ChartPoint[];
