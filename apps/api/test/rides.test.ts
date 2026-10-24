import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  calculateMetrics,
  distanceMeters,
  reliableSpeed,
  RIDE_RULES,
  type RidePayload,
  type RidePoint,
} from '@apex-ride/ride-core';
import { validateRide } from '../src/modules/rides/validation.js';
const start = Date.now() - 60_000;
const point = (patch: Partial<RidePoint> = {}): RidePoint => ({
  latitude: -9.665,
  longitude: -35.735,
  timestamp: start,
  accuracy: 8,
  speed: 10,
  heading: 90,
  altitude: null,
  segment: 0,
  ...patch,
});
const payload = (): RidePayload => ({
  clientId: randomUUID(),
  motorcycleId: randomUUID(),
  mode: 'passeio',
  visibility: 'public',
  startedAt: start,
  endedAt: start + 30_000,
  intervals: [
    { start, end: start + 10_000 },
    { start: start + 20_000, end: start + 30_000 },
  ],
  points: [
    point(),
    point({ longitude: -35.7349, timestamp: start + 1_000 }),
    point({ longitude: -35.734, timestamp: start + 20_000, segment: 1 }),
    point({ longitude: -35.7339, timestamp: start + 21_000, segment: 1 }),
  ],
});
describe('Métricas e validação de Ride com GPS exclusivamente simulado', () => {
  it('usa haversine e separa pausas sem somar a ponte', () => {
    const b = payload(),
      { metrics: m } = validateRide(b);
    expect(m.activeMs).toBe(20_000);
    expect(m.pausedMs).toBe(10_000);
    expect(m.distanceMeters).toBeCloseTo(
      2 * distanceMeters(b.points[0]!, b.points[1]!),
      3,
    );
    expect(m.averageKmh).toBeCloseTo((m.distanceMeters / 20_000) * 3600);
    expect(m.maximumKmh).toBe(36);
  });
  it.each(['passeio', 'pista', 'misto'] as const)('aceita modo %s', (mode) => {
    const b = payload();
    b.mode = mode;
    expect(validateRide(b).payload.mode).toBe(mode);
  });
  it.each(['public', 'private'] as const)(
    'aceita visibilidade %s',
    (visibility) => {
      const b = payload();
      b.visibility = visibility;
      expect(validateRide(b).payload.visibility).toBe(visibility);
    },
  );
  it.each([
    'latitude',
    'longitude',
    'accuracy',
    'timestamp',
    'speed',
    'heading',
    'altitude',
  ] as const)('rejeita %s não finito', (key) => {
    const b = payload();
    b.points[0]![key] = NaN;
    expect(() => validateRide(b)).toThrow();
  });
  it('rejeita moto e modo inválidos', () => {
    const b = payload();
    b.motorcycleId = 'other';
    expect(() => validateRide(b)).toThrow();
  });
  it('rejeita ponto durante pausa', () => {
    const b = payload();
    b.points[2]!.timestamp = start + 15_000;
    expect(() => validateRide(b)).toThrow(/período ativo/);
  });
  it('exige segmento após pausa', () => {
    const b = payload();
    b.points[2]!.segment = 0;
    expect(() => validateRide(b)).toThrow(/segmento/);
  });
  it('exige segmento após lacuna', () => {
    const b = payload();
    b.intervals = [{ start, end: b.endedAt }];
    b.points[2]!.segment = 0;
    expect(() => validateRide(b)).toThrow(/segmento/);
  });
  it('rejeita saltos mesmo entre segmentos', () => {
    const b = payload();
    b.points[1]!.latitude = 0;
    b.points[1]!.segment = 1;
    expect(() => validateRide(b)).toThrow(/salto/);
  });
  it('rejeita duplicados, ordem inversa, períodos sobrepostos e horários futuros', () => {
    const b = payload();
    b.points[1]!.timestamp = start;
    expect(() => validateRide(b)).toThrow();
    const c = payload();
    c.intervals[1]!.start = start + 5_000;
    expect(() => validateRide(c)).toThrow();
    const d = payload();
    d.endedAt = Date.now() + 60_000;
    expect(() => validateRide(d)).toThrow();
  });
  it('rejeita limite excedido explicitamente', () => {
    const b = payload();
    b.points = Array(RIDE_RULES.maxPoints + 1).fill(point());
    expect(() => validateRide(b)).toThrow(/Nenhum ponto/);
  });
  it('ignora métricas fornecidas pelo navegador', () => {
    expect(
      validateRide({ ...payload(), distanceMeters: 999999 }).metrics
        .distanceMeters,
    ).toBeLessThan(30);
  });
  it('velocidade pura, zero, indisponível e picos', () => {
    expect(reliableSpeed(point({ speed: 0 }), undefined)).toBe(0);
    expect(reliableSpeed(point({ speed: null }), undefined)).toBeNull();
    expect(reliableSpeed(point({ speed: 200 }), undefined)).toBeNull();
    expect(
      reliableSpeed(point({ timestamp: start + 1000, speed: 90 }), point()),
    ).toBeNull();
  });
  it('filtra oscilação, acumula movimentos pequenos e inclui paradas na média', () => {
    const pts = [
      point(),
      point({ longitude: -35.73499, timestamp: start + 1000 }),
      point({ longitude: -35.73498, timestamp: start + 2000 }),
      point({ longitude: -35.73495, timestamp: start + 3000 }),
    ];
    const m = calculateMetrics(
      start,
      start + 10_000,
      [{ start, end: start + 10_000 }],
      pts,
    );
    expect(m.distanceMeters).toBeGreaterThan(5);
    expect(m.averageKmh).toBeCloseTo((m.distanceMeters / 10_000) * 3600);
  });
  it('sem dados suficientes não inventa média ou máxima e nunca produz tempo negativo', () => {
    const m = calculateMetrics(start, start - 1, [], []);
    expect(m.activeMs).toBe(0);
    expect(m.elapsedMs).toBe(0);
    expect(m.averageKmh).toBeNull();
    expect(m.maximumKmh).toBeNull();
  });
});
