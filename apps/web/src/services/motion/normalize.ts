import type { Vector } from '@apex-ride/ride-core/motion';
export const finite = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);
export const eventTimeValid = (value: number) =>
  finite(value) &&
  value >= 0 &&
  (Math.abs(value - performance.now()) < 1500 ||
    Math.abs(value - Date.now()) < 1500);
export function vector(
  v: { x: number | null; y: number | null; z: number | null } | null,
): Vector | null {
  return v && finite(v.x) && finite(v.y) && finite(v.z)
    ? [v.x, v.y, v.z]
    : null;
}
export const norm = (v: Vector) => Math.hypot(...v);
export const dot = (a: Vector, b: Vector) =>
  a.reduce((s, x, i) => s + x * b[i]!, 0);
export const scale = (v: Vector, n: number): Vector =>
  v.map((x) => x * n) as Vector;
export const subtract = (a: Vector, b: Vector): Vector =>
  a.map((x, i) => x - b[i]!) as Vector;
export const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
