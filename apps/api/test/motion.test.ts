import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { RidePayload } from '@apex-ride/ride-core';
import { MOTION_RULES } from '@apex-ride/ride-core/motion';
import { validateRide } from '../src/modules/rides/validation.js';
import { motionFixture } from './motion-fixtures.js';
const start = Date.now() - 60000;
function activity(): RidePayload {
  return {
    clientId: randomUUID(),
    motorcycleId: randomUUID(),
    mode: 'passeio',
    visibility: 'private',
    startedAt: start,
    endedAt: start + 10000,
    intervals: [
      { start, end: start + 1000 },
      { start: start + 5000, end: start + 10000 },
    ],
    points: [
      {
        latitude: -9.6,
        longitude: -35.7,
        timestamp: start,
        accuracy: 8,
        speed: 0,
        heading: null,
        altitude: null,
        segment: 0,
      },
    ],
    motion: motionFixture(start),
  };
}
describe('Contrato de movimento opcional e estatísticas reproduzíveis', () => {
  it('recalcula máximos e ignora métricas inventadas pelo cliente', () => {
    const b = activity();
    b.motion!.stats.maxAccelerationG = 999;
    const m = validateRide(b).payload.motion!;
    expect(m.stats.maxAccelerationG).toBe(1);
    expect(m.stats.maxBrakingG).toBe(1);
    expect(m.stats.meanLeft).toBeNull();
    expect(m.stats.maxRight).toBeNull();
  });
  it('preserva atividades GPS e telemetria sem leituras confiáveis', () => {
    const b = activity();
    delete b.motion;
    expect(validateRide(b).payload.motion).toBeUndefined();
    b.motion = motionFixture(start);
    b.motion.calibration = null;
    b.motion.samples = [];
    expect(validateRide(b).payload.motion!.stats.maxAccelerationG).toBeNull();
  });
  it.each([
    'longitudinal',
    'accelerationG',
    'brakingG',
    'relativeMs',
    'eventTimestamp',
    'sequence',
    'segment',
  ] as const)('rejeita %s não finito', (key) => {
    const b = activity();
    b.motion!.samples[0]![key] = Infinity;
    expect(() => validateRide(b)).toThrow(/movimento/);
  });
  it.each(['missing', 'basis', 'mount', 'time', 'bias'] as const)(
    'rejeita calibração %s',
    (condition) => {
      const b = activity(),
        c = b.motion!.calibration!;
      if (condition === 'missing') b.motion!.calibration = null;
      if (condition === 'basis') c.basis[0] = [1, 0, 1];
      if (condition === 'mount') c.mount = 'unknown' as never;
      if (condition === 'time') c.at = start + 1000;
      if (condition === 'bias') c.bias = [1, 0, 0];
      expect(() => validateRide(b)).toThrow(/movimento/);
    },
  );
  it('rejeita pausa, duplicatas, ordem inversa e falta de segmento após pausa', () => {
    const b = activity();
    b.motion!.samples[2]!.relativeMs = 3000;
    expect(() => validateRide(b)).toThrow();
    b.motion = motionFixture(start);
    b.motion.samples[2]!.relativeMs = 200;
    expect(() => validateRide(b)).toThrow();
    b.motion = motionFixture(start);
    b.motion.samples[2]!.relativeMs = 5000;
    expect(() => validateRide(b)).toThrow();
    b.motion.samples[2]!.segment = 1;
    expect(validateRide(b).payload.motion!.samples).toHaveLength(3);
  });
  it('rejeita força G incoerente, inclinação não homologada e falsas métricas sem calibração', () => {
    const b = activity();
    b.motion!.samples[0]!.accelerationG = 2;
    expect(() => validateRide(b)).toThrow();
    b.motion = motionFixture(start);
    b.motion.samples[0]!.lean = 30;
    expect(() => validateRide(b)).toThrow();
    b.motion = motionFixture(start);
    b.motion.samples[0]!.quality = 'invalid';
    expect(() => validateRide(b)).toThrow();
  });
  it('limita volume de amostras, lacunas e valida versão', () => {
    const b = activity();
    b.motion!.samples[0]!.sequence = 2147483648;
    expect(() => validateRide(b)).toThrow();
    b.motion = motionFixture(start);
    b.motion!.samples = Array(MOTION_RULES.maxSamples + 1).fill(
      b.motion!.samples[0],
    );
    expect(() => validateRide(b)).toThrow();
    b.motion = motionFixture(start);
    b.motion.gaps = Array(MOTION_RULES.maxGaps + 1).fill({
      relativeMs: 0,
      reason: 'signal',
    });
    expect(() => validateRide(b)).toThrow();
    b.motion = motionFixture(start);
    b.motion.version = 'other' as never;
    expect(() => validateRide(b)).toThrow();
    b.motion = motionFixture(start);
    b.motion.gaps = [{ relativeMs: 11000, reason: 'signal' }];
    expect(() => validateRide(b)).toThrow();
  });
});
