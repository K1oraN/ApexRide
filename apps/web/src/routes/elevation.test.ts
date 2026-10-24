import { expect, it } from 'vitest';
import type { Coordinate } from '@apex-ride/ride-core/routes';
import { elevationProfile } from './elevation';
const coordinates: Coordinate[] = Array.from({ length: 9 }, (_, i) => [
  -35.73 + i * 0.001,
  -9.66,
]);
it.each([
  {
    heights: [100, 100, 100, 100, 100, 100, 100, 100, 100],
    ascent: 0,
    descent: 0,
  },
  { heights: [0, 10, 20, 30, 40, 50, 60, 70, 80], ascent: 80, descent: 0 },
  { heights: [80, 70, 60, 50, 40, 30, 20, 10, 0], ascent: 0, descent: 80 },
  {
    heights: [100, 101, 99, 100, 101, 99, 100, 101, 100],
    ascent: 0,
    descent: 0,
  },
])(
  'ganho/perda verificáveis, sem acumular ruído: $ascent/$descent',
  ({ heights, ascent, descent }) => {
    const raw = [...heights];
    const result = elevationProfile(coordinates, raw);
    expect(result.ascent).toBe(ascent);
    expect(result.descent).toBe(descent);
    expect(result.sufficient).toBe(true);
    expect(raw).toEqual(heights);
    expect(result.version).toBe('elevation-1');
  },
);
it('ausência não vira zero e não conecta lacunas', () => {
  const result = elevationProfile(coordinates, [
    100,
    110,
    null,
    null,
    200,
    210,
    220,
    null,
    300,
  ]);
  expect(result.points[2]!.altitude).toBeNull();
  expect(result.ascent).toBe(30);
  expect(elevationProfile(coordinates, []).sufficient).toBe(false);
  expect(elevationProfile(coordinates, []).min).toBeNull();
});
it('descarta salto impossível e não cria ganho artificial', () => {
  const result = elevationProfile(
    coordinates,
    [100, 100, 100, 1000, 1000, 1000, 100, 100, 100],
  );
  expect(result.points.some((p) => p.altitude === null)).toBe(true);
  expect(result.ascent).toBe(0);
  expect(result.descent).toBe(0);
});
it('lacuna espacial não soma altitude entre pontos distantes', () => {
  const points: Coordinate[] = [
    [0, 0],
    [0.001, 0],
    [1, 1],
    [1.001, 1],
    [1.002, 1],
  ];
  const result = elevationProfile(points, [100, 110, 1000, 1000, 1010]);
  expect(result.points[2]!.altitude).toBeNull();
  expect(result.ascent).toBe(20);
});
