import { describe, expect, it } from 'vitest';
import { calculateMetrics, cumulativeDistances } from '@apex-ride/ride-core';
import { fixture } from '../../replay/fixtures';
import { mapMediaTime } from './sync';
import { prepareVideoTelemetry } from './resolver';
import { segment } from './fixtures';
import { motionStats, type MotionSample } from '@apex-ride/ride-core/motion';
import { start } from '../../replay/fixtures';
describe('17A relógio mídia → sessão → Replay', () => {
  it.each([0, 12000, 20000])(
    'âncora independente em %d ms, inclusive troca de câmera',
    (elapsed) => {
      expect(mapMediaTime(segment(elapsed), fixture(), 1)?.elapsed).toBe(
        elapsed + 1000,
      );
    },
  );
  it.each([100, -100, 0])('offset %d preserva âncoras', (offset) => {
    const s = segment(1000),
      before = structuredClone(s);
    expect(mapMediaTime(s, fixture(), 1, offset)?.elapsed).toBe(2000 + offset);
    expect(s).toEqual(before);
  });
  it('rejeita tempos inválidos, fora do arquivo e fora da sessão', () => {
    const s = segment();
    for (const t of [-1, NaN, Infinity, 11, 31])
      expect(mapMediaTime(s, fixture(), t)).toBeNull();
    expect(mapMediaTime({ ...s, start: null }, fixture(), 0)).toBeNull();
    expect(mapMediaTime(s, fixture(), 0, -100)).toBeNull();
  });
  it('pausa real não consulta tempo ativo colapsado, retomada usa segmento próprio', () => {
    const resolve = prepareVideoTelemetry({ payload: fixture(), laps: [] });
    expect(resolve(segment(12000), 1, 0)?.frame).toBeNull();
    expect(resolve(segment(20000), 1, 0)?.frame?.speedKmh).toBe(36);
    expect(resolve(segment(20000), 1, 0)?.activeMs).toBe(11000);
  });
  it('busca reversível, GPS irregular, lacuna e sensores ausentes', () => {
    const resolve = prepareVideoTelemetry({ payload: fixture(), laps: [] });
    const s = segment();
    expect(resolve(s, 1, 0)?.frame?.speedKmh).toBe(36);
    expect(resolve(s, 3, 0)?.frame?.speedKmh).toBeNull();
    expect(resolve(s, 1, 0)?.frame?.accelerationG).toBeNull();
    expect(resolve(s, 1, 0)?.frame?.lean).toBeNull();
    expect(resolve(s, 1, 0)?.frame?.speedKmh).toBe(36);
  });
  it('prefixos usam exatamente a regra histórica, sem unir lacunas', () => {
    const p = fixture();
    const values = cumulativeDistances(p.points);
    [0, 10.9618, 43.8473, 98.6565, 98.6565, 109.6183].forEach((meters, i) =>
      expect(values[i]).toBeCloseTo(meters, 3),
    );
    p.points.forEach((_, i) =>
      expect(values[i]).toBe(
        calculateMetrics(
          p.startedAt,
          p.endedAt,
          p.intervals,
          p.points.slice(0, i + 1),
        ).distanceMeters,
      ),
    );
  });
  it('distância mantém a regra histórica mesmo quando o Replay interrompe a interpolação visual', () => {
    const p = fixture();
    p.points = [
      p.points[0]!,
      {
        ...p.points[0]!,
        timestamp: start + 6000,
        longitude: p.points[0]!.longitude + 0.0006,
      },
    ];
    const value = prepareVideoTelemetry({ payload: p, laps: [] })(
      segment(),
      6,
      0,
    );
    expect(value?.distanceMeters).toBeCloseTo(65.7709, 3);
  });
  it('sensores mais frequentes que GPS usam apenas estimativas calibradas e recentes', () => {
    const p = fixture();
    const samples: MotionSample[] = [1000, 1100, 1200].map((t, i) => ({
      sequence: i,
      relativeMs: t,
      eventTimestamp: 99,
      segment: 0,
      longitudinal: 1,
      accelerationG: 0.1 + i * 0.1,
      brakingG: 0,
      lean: -22,
      quality: 'limited',
      source: 'browser-linear',
    }));
    p.motion = {
      version: 'motion-1',
      truncated: false,
      gaps: [],
      samples,
      stats: motionStats(samples),
      calibration: {
        at: start,
        valid: true,
        version: 'motion-1',
        mount: 'top-forward',
        screenAngle: 0,
        basis: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        bias: [0, 0, 0],
      },
    };
    const resolve = prepareVideoTelemetry({ payload: p, laps: [] });
    expect(resolve(segment(), 1.15, 0)?.frame).toMatchObject({
      speedKmh: 36,
      accelerationG: 0.2,
      lean: -22,
    });
    expect(resolve(segment(), 1.8, 0)?.frame?.accelerationG).toBeNull();
    p.motion.calibration!.valid = false;
    expect(
      prepareVideoTelemetry({ payload: p, laps: [] })(segment(), 1.15, 0)?.frame
        ?.lean,
    ).toBeNull();
  });
});
