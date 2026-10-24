import { describe, it, expect } from 'vitest';
import {
  alignActivity,
  routeReference,
  compatiblePlans,
  intersectRanges,
  timeOnRanges,
  COMPARISON_RULES,
} from '@apex-ride/ride-core/comparison';
import {
  comparisonQuery,
  matchesRegion,
  bikeFilters,
} from '../src/modules/comparisons/policy.js';
import type { RidePoint } from '@apex-ride/ride-core';
import type { RoutePlan, Coordinate } from '@apex-ride/ride-core/routes';
const start = 1700000000000;
function plan(
  coordinates: Coordinate[] = [
    [0, 0],
    [0.01, 0],
  ],
): RoutePlan {
  return {
    id: 'a',
    version: 1,
    name: 'Teste',
    kind: 'route',
    geometry: { type: 'LineString', coordinates },
    distanceMeters: 1112,
    verification: 'suggested',
    startLine: null,
    direction: null,
  };
}
function points(n = 101): RidePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    longitude: i / 10000,
    latitude: 0,
    timestamp: start + i * 1000,
    speed: 11,
    heading: 90,
    accuracy: 5,
    altitude: null,
    segment: 0,
  }));
}
function align(
  ps = points(),
  p = plan(),
  ref = p,
  intervals = [{ start, end: start + 200000 }],
) {
  return alignActivity(routeReference(ref), {
    plan: p,
    points: ps,
    startedAt: start,
    intervals,
  });
}
describe('14A seleção, filtros e versões', () => {
  it('aceita versões com geometria idêntica e bloqueia outro percurso/versão alterada', () => {
    expect(compatiblePlans(plan(), { ...plan(), version: 2 })).toBe(true);
    expect(align(points(), { ...plan(), id: 'b' }, plan()).state).toBe('none');
    expect(
      align(
        points(),
        plan([
          [0, 0],
          [0.02, 0],
        ]),
        plan(),
      ).state,
    ).toBe('none');
    expect(compatiblePlans(plan(), null)).toBe(false);
    expect(compatiblePlans(plan(), { ...plan(), direction: -1 })).toBe(false);
  });
  it('valida categoria, cc e limites sem inferir categoria', () => {
    const q = comparisonQuery({
        category: 'Não classificada',
        ccBand: '2',
        city: 'Maceió',
        state: 'AL',
        region: 'Nordeste',
      }),
      values: unknown[] = [];
    expect(matchesRegion({ city: 'Maceió', state: 'AL' }, q)).toBe(true);
    expect(matchesRegion({ city: 'Recife', state: 'PE' }, q)).toBe(false);
    expect(bikeFilters(q, values)).toContain('BETWEEN');
    expect(values).toEqual(['Não classificada', 501, 750]);
    for (const query of [
      { category: 'Desconhecida' },
      { ccBand: '7' },
      { page: '0' },
      { limit: '51' },
      { sort: 'speed' },
      { scope: 'public' },
    ])
      expect(() => comparisonQuery(query)).toThrow();
  });
});
describe('14B alinhamento pela geometria', () => {
  it('cobre rota completa sem alterar distância original e normaliza por posição', () => {
    const a = align();
    expect(a.state).toBe('full');
    expect(a.coverage).toBeCloseTo(1, 3);
    expect(a.samples[1]!.meters).toBe(25);
    expect(timeOnRanges(a, a.ranges, routeReference(plan()).total)).toBeCloseTo(
      100000,
      0,
    );
  });
  it('identifica atividade parcial e interseção real', () => {
    const a = align(points().slice(0, 51)),
      b = align(points().slice(25, 76));
    expect(a.state).toBe('partial');
    expect(a.coverage).toBeCloseTo(0.5, 2);
    expect(align(points().slice(2)).state).toBe('partial');
    const common = intersectRanges([a.ranges, b.ranges]);
    expect(common[0]![1] - common[0]![0]).toBeCloseTo(278, 0);
  });
  it('conta parada observada dentro de intervalo ativo sem inventar deslocamento', () => {
    const ps = points(),
      stationary = { ...ps[50]!, timestamp: ps[50]!.timestamp + 5000 };
    const a = align([
      ...ps.slice(0, 51),
      stationary,
      ...ps.slice(51).map((p) => ({ ...p, timestamp: p.timestamp + 5000 })),
    ]);
    expect(a.state).toBe('full');
    expect(timeOnRanges(a, a.ranges, routeReference(plan()).total)).toBeCloseTo(
      105000,
      0,
    );
    expect(a.samples.every((p) => Number.isFinite(p.segmentMs))).toBe(true);
  });
  it('não aceita GPS insuficiente, reverso ou todo impreciso', () => {
    expect(align(points().slice(0, 2)).state).toBe('none');
    expect(
      align(points().map((p) => ({ ...p, longitude: 0.01 - p.longitude })))
        .state,
    ).toBe('none');
    expect(align(points().map((p) => ({ ...p, accuracy: 50 }))).state).toBe(
      'none',
    );
  });
  it('preserva lacunas GPS e pausas sem interpolar nem somar o tempo ausente', () => {
    const ps = points().filter((_, i) => i < 40 || i > 60),
      a = align(ps);
    expect(a.state).toBe('limited');
    expect(a.ranges).toHaveLength(2);
    expect(a.samples.some((p) => p.meters > 450 && p.meters < 650)).toBe(false);
    const b = align(points(), plan(), plan(), [
      { start, end: start + 39000 },
      { start: start + 61000, end: start + 200000 },
    ]);
    expect(b.ranges).toHaveLength(2);
    expect(timeOnRanges(b, b.ranges, 1112)).toBeLessThan(80000);
  });
  it('segmentos, pontos rejeitados, desvios e retorno não conectam trechos', () => {
    for (const change of [
      (p: RidePoint, i: number) => ({ ...p, segment: i >= 50 ? 1 : 0 }),
      (p: RidePoint, i: number) => ({
        ...p,
        accuracy: i === 50 ? 40 : p.accuracy,
      }),
      (p: RidePoint, i: number) => ({
        ...p,
        latitude: i > 40 && i < 60 ? 0.001 : 0,
      }),
    ]) {
      const a = align(points().map(change));
      expect(a.ranges.length).toBeGreaterThan(1);
    }
  });
  it('rejeita pontos fora de ordem sem reorganizar o histórico', () => {
    const ps = points();
    [ps[40], ps[60]] = [ps[60]!, ps[40]!];
    const a = align(ps);
    expect(a.issues.join()).toContain('rejeitados');
    expect(a.coverage).toBeLessThan(0.99);
  });
  it('ruído e frequências distintas mantêm a mesma posição geográfica', () => {
    const a = align(
        points().map((p, i) => ({ ...p, latitude: (i % 2) * 0.00002 })),
      ),
      b = align(points().filter((_, i) => i % 2 === 0));
    expect(a.coverage).toBeGreaterThan(0.95);
    expect(b.coverage).toBeGreaterThan(0.95);
    expect(a.samples[10]!.meters).toBe(b.samples[10]!.meters);
  });
  it.each([
    [
      [0, 0],
      [0.002, 0],
      [0.002, 0.002],
      [0.004, 0.002],
    ],
    [
      [0, 0],
      [0.002, 0],
      [0.002, 0.0002],
      [0, 0.0002],
    ],
    [
      [0, 0],
      [0.002, 0.002],
      [0, 0.002],
      [0.002, 0],
    ],
    [
      [0, 0],
      [0.002, 0],
      [0.002, 0.002],
      [0, 0.002],
      [0, 0],
    ],
  ] as Coordinate[][])(
    'continuidade em curvas, retorno paralelo, cruzamento e alça %j',
    (...coords) => {
      const p = plan(coords as Coordinate[]),
        ps: RidePoint[] = [];
      for (let j = 1; j < p.geometry.coordinates.length; j++)
        for (let i = 0; i < 20; i++) {
          const a = p.geometry.coordinates[j - 1]!,
            b = p.geometry.coordinates[j]!;
          ps.push({
            ...points(1)[0]!,
            longitude: a[0] + ((b[0] - a[0]) * i) / 20,
            latitude: a[1] + ((b[1] - a[1]) * i) / 20,
            timestamp: start + ps.length * 1000,
          });
        }
      const result = align(ps, p);
      expect(result.coverage).toBeGreaterThan(0.7);
      expect(result.edges.every((e) => e.b.along - e.a.along < 50)).toBe(true);
    },
  );
  it('sobreposição exata ambígua não escolhe ramo arbitrário', () => {
    const p = plan([
        [0, 0],
        [0.01, 0],
        [0, 0],
        [0.01, 0],
      ]),
      a = align(points(), p);
    expect(a.state).toBe('none');
    expect(a.issues.join()).toContain('ambíguos');
  });
  it('valores GPS ausentes não viram zero e orçamento espacial é limitado', () => {
    const a = align(points().map((p) => ({ ...p, speed: null })));
    expect(a.samples.every((s) => s.gps === null)).toBe(true);
    expect(() =>
      routeReference(plan(), { ...COMPARISON_RULES, maxIndexEntries: 2 }),
    ).toThrow();
  });
  it('50.000 pontos e 5.000 segmentos mantêm amostragem e tempo limitados', () => {
    const p = plan(
      Array.from({ length: 5001 }, (_, i) => [i * 0.0001, 0] as Coordinate),
    );
    const ps = Array.from({ length: 50000 }, (_, i) => ({
      ...points(1)[0]!,
      longitude: i * 0.00001,
      timestamp: start + i * 1000,
      speed: 1.1,
    }));
    const reference = routeReference(p),
      t = performance.now(),
      a = alignActivity(reference, {
        plan: p,
        points: ps,
        startedAt: start,
        intervals: [{ start, end: start + 50000000 }],
      });
    expect(a.state).toBe('full');
    expect(a.samples.length).toBeLessThanOrEqual(801);
    expect(performance.now() - t).toBeLessThan(2000);
    expect(ps).toHaveLength(50000);
    const section = reference.section([100, 200]);
    expect(section.coordinates.length).toBeGreaterThan(2);
  });
});
