import { describe, it, expect } from 'vitest';
import type { RidePoint } from '@apex-ride/ride-core';
import { prepare } from '../src/modules/similarity/geometry.js';
import { recognize, personalGroups } from '../src/modules/similarity/engine.js';
const start = 1700000000000;
function points(n = 101, offset = 0): RidePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    longitude: -35.73 + i * 0.0001,
    latitude: -9.66 + offset,
    timestamp: start + i * 1000,
    accuracy: 3,
    speed: 11,
    heading: null,
    altitude: null,
    segment: 0,
  }));
}
const intervals = [{ start, end: start + 1000000 }];
const run = (a: RidePoint[], b: RidePoint[]) =>
  recognize(prepare(a, intervals), prepare(b, intervals), intervals, start);
describe('15A preparação GPS', () => {
  it('preserva originais e separa pausas, lacunas, saltos e pontos imprecisos', () => {
    const p = points();
    p[40]!.accuracy = 40;
    p[60]!.segment = 1;
    const copy = structuredClone(p),
      result = prepare(p, intervals);
    expect(p).toEqual(copy);
    expect(result.rejected).toBe(1);
    expect(result.segments.length).toBeGreaterThan(2);
    expect(prepare([], intervals).reason).toMatch(/insuficientes/);
    expect(prepare(points(5), intervals).reason).toBeTruthy();
  });
  it('não cria caminho sobre geometria inválida ou ordem temporal corrompida', () => {
    const p = points();
    p[5]!.latitude = NaN;
    expect(prepare(p, intervals).rejected).toBe(1);
    expect(prepare(points().reverse(), intervals).reason).toMatch(/Ordem/);
  });
});
describe('15B reconhecimento e grupos', () => {
  it('reconhece idênticos sem rota e cobertura em metros', () => {
    const r = run(points(), points());
    expect(r.classification).toBe('full');
    expect(r.sharedMeters).toBeGreaterThan(1000);
    expect(r.coverageA).toBeCloseTo(1);
  });
  it('aceita ruído pequeno e frequências diferentes', () => {
    const p = points()
      .filter((_, i) => i % 2 === 0)
      .map((p, i) => ({
        ...p,
        latitude: p.latitude + (i % 2 ? 0.00001 : -0.00001),
      }));
    expect(run(points(), p).classification).toBe('full');
  });
  it('identifica sentido contrário sem torná-lo comparável', () => {
    const p = points()
      .reverse()
      .map((p, i) => ({ ...p, timestamp: start + i * 1000 }));
    expect(run(points(), p).classification).toBe('opposite');
  });
  it('calcula cobertura assimétrica de trecho contido e janelas reais', () => {
    const r = run(points(201), points().slice(20, 81));
    expect(r.classification).toBe('partial');
    expect(r.coverageA).toBeCloseTo(0.3, 1);
    expect(r.coverageB).toBeCloseTo(1);
    expect(r.pieces[0]!.a[0]).toBeCloseTo(start + 20000, 0);
  });
  it('rejeita cruzamento isolado, vias paralelas e GPS ruim', () => {
    expect(run(points(), points(101, 0.00015)).classification).toBe('none');
    expect(
      run(
        points(),
        points().map((p) => ({ ...p, accuracy: 40 })),
      ).classification,
    ).toBe('inconclusive');
    expect(
      run(
        points(),
        points().map((p, i) => ({
          ...p,
          longitude: -35.725,
          latitude: -9.665 + i * 0.0001,
        })),
      ).classification,
    ).toBe('none');
  });
  it('não soma lacunas nem duplica cobertura', () => {
    const a = points(201),
      b = a.map((p, i) => ({ ...p, segment: i < 80 ? 0 : 1 }));
    const r = run(b, b);
    expect(r.pieces.length).toBe(2);
    expect(r.classification).toBe('limited');
    expect(r.coverageA).toBeLessThanOrEqual(1);
    const dup = points().flatMap((p) => [p, { ...p }]);
    expect(run(dup, points()).coverageA).toBeLessThanOrEqual(1);
  });
  it('não agrupa por transitividade', () => {
    expect(
      personalGroups([
        { a: 'A', b: 'B', classification: 'full' },
        { a: 'B', b: 'C', classification: 'full' },
      ]),
    ).toEqual([['A', 'B']]);
    expect(
      personalGroups([
        { a: 'A', b: 'B', classification: 'full' },
        { a: 'B', b: 'C', classification: 'full' },
        { a: 'A', b: 'C', classification: 'full' },
      ]),
    ).toEqual([['A', 'B', 'C']]);
  });
  it('vias paralelas a 5 m permanecem inconclusivas', () => {
    expect(run(points(), points(101, 5 / 111195)).classification).toBe(
      'inconclusive',
    );
  });
  it('rejeita trecho comum curto e aceita origens/destinos diferentes', () => {
    expect(run(points(), points().slice(10, 25)).classification).toBe(
      'inconclusive',
    );
    expect(run(points(201), points(201).slice(30, 160)).classification).toBe(
      'partial',
    );
  });
  it('respeita intervalos ativos e salto rejeitado sem ligar pontas', () => {
    const ps = points(201);
    ps[100]!.latitude = 0;
    const prepared = prepare(ps, intervals);
    expect(prepared.rejected).toBeGreaterThan(0);
    expect(prepared.segments.length).toBeGreaterThan(1);
    const paused = prepare(points(201), [
      { start, end: start + 80000 },
      { start: start + 120000, end: start + 200000 },
    ]);
    expect(paused.interrupted).toBe(true);
    expect(paused.segments).toHaveLength(2);
  });
  it.each(['curva', 'trevo', 'oito', 'retorno'])(
    'geometria conhecida: %s não produz cobertura inventada',
    (kind) => {
      const ps = Array.from({ length: 401 }, (_, i) => {
        const t = (i / 400) * Math.PI * 2;
        return {
          ...points(1)[0]!,
          longitude: -35.73 + 0.005 * Math.sin(t),
          latitude:
            -9.66 +
            0.005 *
              (kind === 'oito'
                ? Math.sin(2 * t)
                : kind === 'retorno'
                  ? 0
                  : Math.cos(t)),
          timestamp: start + i * 1000,
        };
      });
      const r = run(ps, ps);
      expect(r.coverageA).toBeLessThanOrEqual(1);
      expect(r.coverageB).toBeLessThanOrEqual(1);
      expect(r.sharedMeters).toBeLessThanOrEqual(
        prepare(ps, intervals).meters + 1,
      );
      expect(r.sharedMeters).toBeGreaterThan(300);
    },
  );
  it('50.000 pontos são processados com simplificação conservadora e orçamento', () => {
    const ps = Array.from({ length: 50000 }, (_, i) => ({
      ...points(1)[0]!,
      longitude: -35.73 + i * 0.000001,
      timestamp: start + i * 1000,
    }));
    const all = [{ start, end: start + 50000000 }],
      gps = prepare(ps, all),
      before = performance.now();
    const r = recognize(gps, gps, all, start);
    expect(r.classification).toBe('full');
    expect(performance.now() - before).toBeLessThan(6000);
    expect(ps).toHaveLength(50000);
  });
});
