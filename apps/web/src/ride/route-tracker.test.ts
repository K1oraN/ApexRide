import { describe, it, expect } from 'vitest';
import {
  RouteTracker,
  lineLength,
  type RoutePlan,
} from '@apex-ride/ride-core/routes';
import type { RidePoint } from '@apex-ride/ride-core';
export const plan: RoutePlan = {
  id: 'f343c063-dc05-4abc-b7e9-4ad2c5646338',
  version: 1,
  name: 'Teste',
  kind: 'route',
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [0.01, 0],
    ],
  },
  distanceMeters: 1112,
  verification: 'suggested',
  startLine: null,
  direction: null,
};
const p = (
  x: number,
  t: number,
  lat = 0,
  accuracy = 5,
  segment = 0,
): RidePoint => ({
  longitude: x,
  latitude: lat,
  timestamp: t,
  accuracy,
  segment,
  speed: 10,
  heading: 90,
  altitude: null,
});
describe('11C progresso e desvios', () => {
  it('projeta ao longo e completa somente após observar percurso', () => {
    const tracker = new RouteTracker(plan);
    for (let i = 0; i <= 100; i++) tracker.update(p(i * 0.0001, i * 1000));
    expect(tracker.snapshot()).toMatchObject({
      completed: true,
      status: 'on-route',
    });
    expect(tracker.snapshot().percent).toBeCloseTo(100);
    expect(lineLength(plan.geometry)).toBeGreaterThan(1100);
  });
  it('passar pelo destino não conclui; salto não ganha progresso', () => {
    const t = new RouteTracker(plan);
    t.update(p(0.0099, 1000));
    expect(t.update(p(0.01, 2000)).completed).toBe(false);
    const jump = new RouteTracker(plan);
    jump.update(p(0, 1000));
    expect(jump.update(p(0.01, 2000)).covered).toBe(0);
  });
  it('GPS impreciso não declara desvio; exige continuidade e tempo', () => {
    const t = new RouteTracker(plan);
    expect(t.update(p(0.001, 1000, 0.01, 100)).status).toBe('inaccurate');
    expect(t.update(p(0.001, 2000, 0.01)).status).toBe('possible-deviation');
    t.update(p(0.001, 4000, 0.01));
    expect(t.update(p(0.001, 8000, 0.01)).status).toBe('off-route');
    expect(t.update(p(0.001, 9000)).status).toBe('on-route');
  });
  it('pausa e lacuna não inventam trecho percorrido', () => {
    const t = new RouteTracker(plan);
    t.update(p(0, 1000));
    t.update(p(0.0001, 2000));
    const n = t.snapshot().covered;
    t.interrupt();
    t.update(p(0.005, 10000, 0, 5, 1));
    expect(t.snapshot().covered).toBe(n);
    t.update(p(0.009, 30000, 0, 5, 2));
    expect(t.snapshot().covered).toBe(n);
  });
  it('retorno não soma o mesmo trecho duas vezes', () => {
    const t = new RouteTracker(plan);
    for (let i = 0; i < 20; i++) t.update(p(i * 0.0001, i * 1000));
    const n = t.snapshot().covered;
    for (let i = 0; i < 20; i++)
      t.update(p((19 - i) * 0.0001, (20 + i) * 1000));
    expect(t.snapshot().covered).toBeCloseTo(n);
    expect(t.snapshot().completed).toBe(false);
  });
  it('não projeta salto entre seções próximas e fora de ordem', () => {
    const t = new RouteTracker(plan);
    t.update(p(0, 1000));
    t.update(p(0.001, 2000));
    const before = t.snapshot();
    t.update(p(0.009, 2500));
    expect(t.snapshot().covered).toBe(before.covered);
    t.update(p(0.01, 2000));
    expect(t.snapshot().covered).toBe(before.covered);
  });
});
