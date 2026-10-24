import { describe, it, expect } from 'vitest';
import {
  LapDetector,
  detectLaps,
  gateCrossing,
  type RoutePlan,
} from '@apex-ride/ride-core/routes';
import type { RidePoint } from '@apex-ride/ride-core';
export const circuitPlan: RoutePlan = {
  id: 'e543c063-dc05-4abc-b7e9-4ad2c5646338',
  name: 'Circuito sintético',
  version: 1,
  kind: 'circuit',
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ],
  },
  distanceMeters: 445,
  verification: 'verified',
  startLine: {
    type: 'LineString',
    coordinates: [
      [0.0005, 0.0001],
      [0.0005, -0.0001],
    ],
  },
  direction: 1,
};
export function circuitPoints(loops = 3): RidePoint[] {
  const coordinates: [number, number][] = [];
  for (let lap = 0; lap < loops; lap++) {
    for (let i = 0; i < 10; i++) coordinates.push([i * 0.0001, 0]);
    for (let i = 0; i < 10; i++) coordinates.push([0.001, i * 0.0001]);
    for (let i = 0; i < 10; i++) coordinates.push([0.001 - i * 0.0001, 0.001]);
    for (let i = 0; i < 10; i++) coordinates.push([0, 0.001 - i * 0.0001]);
  }
  return coordinates.map(([longitude, latitude], i) => ({
    longitude,
    latitude,
    timestamp: 100000 + i * 1000,
    accuracy: 5,
    speed: 11,
    heading: null,
    altitude: null,
    segment: 0,
  }));
}

describe('11D voltas estimadas', () => {
  it('cruza linha no sentido previsto e interpola só o instante', () => {
    expect(
      gateCrossing(circuitPlan.startLine!, [0.0004, 0], [0.0006, 0], 1),
    ).toBeCloseTo(0.5);
    expect(
      gateCrossing(circuitPlan.startLine!, [0.0006, 0], [0.0004, 0], 1),
    ).toBe(null);
  });
  it('detecta múltiplas voltas com cobertura completa', () => {
    const laps = detectLaps(circuitPlan, circuitPoints(), 'pista');
    expect(laps).toHaveLength(2);
    expect(laps[0]).toMatchObject({
      number: 1,
      status: 'estimated',
      durationMs: 40000,
    });
    expect(laps[1]!.number).toBe(2);
  });
  it('não habilita rota comum, circuito não verificado ou outros modos', () => {
    for (const plan of [
      { ...circuitPlan, kind: 'route' as const },
      { ...circuitPlan, verification: 'suggested' as const },
    ])
      expect(detectLaps(plan, circuitPoints(), 'pista')).toHaveLength(0);
    expect(detectLaps(circuitPlan, circuitPoints(), 'misto')).toHaveLength(0);
  });
  it('não aceita sentido inverso', () => {
    const ps = circuitPoints()
      .reverse()
      .map((p, i) => ({ ...p, timestamp: 100000 + i * 1000 }));
    expect(detectLaps(circuitPlan, ps, 'pista')).toHaveLength(0);
  });
  it('GPS impreciso e falha prolongada invalidam volta corrente', () => {
    const ps = circuitPoints(2);
    ps[20]!.accuracy = 100;
    expect(detectLaps(circuitPlan, ps, 'pista')).toHaveLength(0);
    const gap = circuitPoints(2).map((p, i) => ({
      ...p,
      timestamp: p.timestamp + (i >= 20 ? 20000 : 0),
    }));
    expect(detectLaps(circuitPlan, gap, 'pista')).toHaveLength(0);
  });
  it('pausa invalida volta; pode iniciar nova após retomar', () => {
    const ps = circuitPoints(3).map((p, i) => ({
      ...p,
      segment: i >= 20 ? 1 : 0,
    }));
    expect(detectLaps(circuitPlan, ps, 'pista')).toHaveLength(1);
  });
  it('duplo cruzamento próximo não produz volta falsa', () => {
    const detector = new LapDetector(circuitPlan, 'pista');
    for (let i = 0; i < 30; i++)
      detector.push({
        ...circuitPoints(1)[0]!,
        longitude: i % 2 ? 0.0006 : 0.0004,
        timestamp: 100000 + i * 1000,
      });
    expect(detector.laps).toHaveLength(0);
  });
  it('timestamps inconsistentes, atalhos e volta incompleta não produzem resultado', () => {
    expect(detectLaps(circuitPlan, circuitPoints(1), 'pista')).toHaveLength(0);
    const ps = circuitPoints(2).map((p, i) => ({
      ...p,
      timestamp: i === 20 ? 100000 : p.timestamp,
    }));
    expect(detectLaps(circuitPlan, ps, 'pista')).toHaveLength(0);
  });
});
