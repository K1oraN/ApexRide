import { describe, expect, it } from 'vitest';
import {
  SpeedEstimator,
  SPEED_CONFIG,
  type AccelerationReading,
  sensorMonotonicTime,
} from './estimator';
import type { LocationReading } from '../gps/readings';

const epoch = 1792756800000;
const gps = (
  time = 0,
  speed: number | null = 10,
  patch: Partial<LocationReading> = {},
): LocationReading => ({
  latitude: -9.6,
  longitude: -35.7,
  accuracy: 5,
  speed,
  timestamp: epoch + time,
  heading: 0,
  altitude: null,
  altitudeAccuracy: null,
  ...patch,
});
const sensor = (
  time: number,
  acceleration = 0,
  patch: Partial<AccelerationReading> = {},
): AccelerationReading => ({
  monotonicMs: time,
  longitudinal: acceleration,
  calibrated: true,
  usable: true,
  ...patch,
});
function setup(speed = 10) {
  const e = new SpeedEstimator();
  e.receiveGps(gps(0, speed), epoch, 0);
  e.receiveAcceleration(sensor(0), 0);
  return e;
}
describe('Estimador longitudinal determinístico, independente do React', () => {
  it('concilia eventos epoch e performance com atraso sem usar horário civil para integração', () => {
    expect(sensorMonotonicTime(900, 1000, epoch)).toBe(900);
    expect(sensorMonotonicTime(epoch - 100, 1000, epoch)).toBe(900);
  });
  it('corrige GPS atrasado contra o estado histórico correspondente', () => {
    const e = setup();
    e.receiveAcceleration(sensor(1, 2), 1);
    for (let t = 51; t <= 1251; t += 50) e.receiveAcceleration(sensor(t, 2), t);
    const before = e.snapshot(epoch + 1251, 1251).speedMps!;
    e.receiveGps(gps(1001, 12), epoch + 1251, 1251);
    e.receiveAcceleration(sensor(1301, 2), 1301);
    expect(e.snapshot(epoch + 1301, 1301).speedMps).toBeCloseTo(
      before + 0.1,
      2,
    );
  });
  it('assistido padrão; GPS sem sensores é fallback, sem alterar preferência', () => {
    const e = new SpeedEstimator();
    expect(e.snapshot(epoch, 0).state).toBe('waiting');
    e.receiveGps(gps(), epoch, 0);
    expect(e.snapshot(epoch, 0)).toMatchObject({
      state: 'pure-auto',
      speedMps: 10,
      preference: 'assisted',
    });
  });
  it.each([0, 10, 27.777])(
    'preserva a referência GPS %s e não adiciona velocidade fixa',
    (v) => {
      const e = setup(v);
      for (let t = 50; t <= 900; t += 50) e.receiveAcceleration(sensor(t), t);
      expect(e.snapshot(epoch + 900, 900).speedMps).toBe(v);
    },
  );
  it.each([2, -2])(
    'integra aceleração %s m/s² por intervalos irregulares',
    (a) => {
      const e = setup();
      e.receiveAcceleration(sensor(1, a), 1);
      for (const t of [41, 113, 205, 350, 580, 800, 1001])
        e.receiveAcceleration(sensor(t, a), t);
      expect(e.snapshot(epoch + 1001, 1001).speedMps).toBeCloseTo(10 + a, 2);
    },
  );
  it('frenagem nunca gera velocidade negativa', () => {
    const e = setup(0.1);
    for (let t = 50; t <= 900; t += 50) e.receiveAcceleration(sensor(t, -2), t);
    expect(e.snapshot(epoch + 900, 900).speedMps).toBe(0);
  });
  it.each([null, -1, NaN, Infinity, 101])('rejeita velocidade GPS %s', (v) => {
    const e = new SpeedEstimator();
    e.receiveGps(gps(0, v), epoch, 0);
    expect(e.snapshot(epoch, 0).speedMps).toBeNull();
  });
  it.each(['old', 'future', 'latitude', 'accuracy', 'jump'] as const)(
    'rejeita GPS %s sem inventar velocidade',
    (condition) => {
      const e = new SpeedEstimator();
      if (condition === 'jump') e.receiveGps(gps(), epoch, 0);
      const r = gps(
        condition === 'jump' ? 100 : 0,
        10,
        condition === 'latitude'
          ? { latitude: NaN }
          : condition === 'accuracy'
            ? { accuracy: 100 }
            : condition === 'jump'
              ? { longitude: 0 }
              : {},
      );
      e.receiveGps(
        r,
        condition === 'old'
          ? epoch + 4000
          : condition === 'future'
            ? epoch - 100
            : epoch + 100,
        100,
      );
      expect(e.snapshot(epoch + 100, 100).speedMps).toBe(
        condition === 'jump' ? 10 : null,
      );
    },
  );
  it('não processa GPS duplicado, fora de ordem ou salto de velocidade', () => {
    const e = setup();
    e.receiveGps(gps(0, 40), epoch, 0);
    e.receiveGps(gps(-1, 50), epoch, 0);
    e.receiveGps(gps(100, 80), epoch + 100, 100);
    expect(e.snapshot(epoch + 100, 100).speedMps).toBe(10);
    expect(e.snapshot(epoch + 100, 100).source).toBe('gps');
  });
  it('não integra eventos de movimento duplicados ou fora de ordem', () => {
    const e = setup();
    e.receiveAcceleration(sensor(100, 2), 100);
    const before = e.snapshot(epoch + 100, 100).speedMps;
    e.receiveAcceleration(sensor(100, 8), 100);
    e.receiveAcceleration(sensor(50, 8, { calibrated: false }), 100);
    expect(e.snapshot(epoch + 100, 100).speedMps).toBe(before);
    expect(e.snapshot(epoch + 100, 100).calibrated).toBe(true);
  });
  it.each([
    { longitudinal: NaN },
    { longitudinal: null },
    { longitudinal: Infinity },
    { longitudinal: 9 },
    { calibrated: false },
    { usable: false },
  ])('fallback com aceleração inválida %j', (patch) => {
    const e = setup();
    e.receiveAcceleration(sensor(100, 0, patch), 100);
    expect(e.snapshot(epoch + 100, 100)).toMatchObject({
      speedMps: 10,
      source: 'gps',
      preference: 'assisted',
    });
  });
  it('sensor atrasado, futuro ou interrompido nunca integra a lacuna', () => {
    for (const time of [10, 900, 1100]) {
      const e = setup();
      e.receiveAcceleration(sensor(time, 8), 1000);
      expect(e.snapshot(epoch + 1000, 1000).speedMps).toBe(10);
    }
  });
  it('interrupção e perda de sensores desativam assistência e exigem referência recente para recuperar', () => {
    const e = setup();
    expect(e.snapshot(epoch + 400, 400).source).toBe('gps');
    e.receiveAcceleration(sensor(600, 2), 600);
    expect(e.snapshot(epoch + 600, 600).source).toBe('gps');
    e.receiveGps(gps(700), epoch + 700, 700);
    e.receiveAcceleration(sensor(750, 2), 750);
    expect(e.snapshot(epoch + 750, 750).source).toBe('assisted');
  });
  it('nova referência aplica correção complementar verificável', () => {
    const e = setup();
    for (let t = 50; t <= 950; t += 50) e.receiveAcceleration(sensor(t, 1), t);
    const predicted = e.snapshot(epoch + 950, 950).speedMps!;
    e.receiveGps(gps(1000, 11.5), epoch + 1000, 1000);
    e.receiveAcceleration(sensor(1000, 0), 1000);
    expect(e.snapshot(epoch + 1000, 1000).speedMps).toBeCloseTo(
      predicted + 0.8 * (11.5 - predicted),
    );
  });
  it('contradição reinicializa em GPS e só recupera no próximo GPS consistente', () => {
    const e = setup();
    for (let t = 50; t <= 950; t += 50) e.receiveAcceleration(sensor(t), t);
    e.receiveGps(gps(1000, 15), epoch + 1000, 1000);
    e.receiveAcceleration(sensor(1050, 0), 1050);
    expect(e.snapshot(epoch + 1050, 1050)).toMatchObject({
      source: 'gps',
      speedMps: 15,
      reason: 'drift',
    });
    e.receiveGps(gps(2000, 15), epoch + 2000, 2000);
    e.receiveAcceleration(sensor(2050, 0), 2050);
    expect(e.snapshot(epoch + 2050, 2050).source).toBe('assisted');
  });
  it('deriva e horizonte são limitados; dado desatualizado é ausente, não zero', () => {
    const e = setup();
    for (let t = 50; t <= 2000; t += 50) e.receiveAcceleration(sensor(t, 8), t);
    expect(e.snapshot(epoch + 2000, 2000)).toMatchObject({
      source: 'gps',
      reason: 'drift',
    });
    e.receiveAcceleration(sensor(2050), 2050);
    expect(e.snapshot(epoch + 2050, 2050)).toMatchObject({
      source: 'gps',
      reason: 'horizon',
    });
    expect(e.snapshot(epoch + 3100, 3100)).toMatchObject({
      speedMps: null,
      state: 'stale',
    });
  });
  it('perda breve de GPS preserva previsão apenas dentro do horizonte', () => {
    const e = setup();
    for (let t = 50; t <= 2050; t += 50)
      e.receiveAcceleration(sensor(t, 0.1), t);
    expect(e.snapshot(epoch + 2050, 2050).source).toBe('gps');
    e.receiveGps(gps(2100, 10.2), epoch + 2100, 2100);
    e.receiveAcceleration(sensor(2150), 2150);
    expect(e.snapshot(epoch + 2150, 2150).source).toBe('assisted');
  });
  it('GPS Puro ignora inércia e escolha manual persiste até troca explícita', () => {
    const e = setup();
    e.setMode('pure');
    e.receiveGps(gps(), epoch, 0);
    e.receiveAcceleration(sensor(100, 8), 100);
    expect(e.snapshot(epoch + 100, 100)).toMatchObject({
      speedMps: 10,
      state: 'pure-selected',
      preference: 'pure',
    });
    e.reset();
    expect(e.snapshot(epoch, 0).preference).toBe('pure');
    e.setMode('assisted');
    expect(e.snapshot(epoch, 0).speedMps).toBeNull();
  });
  it('reinicialização impede integrar intervalo de pausa ou sessão anterior', () => {
    const e = setup();
    e.reset();
    e.receiveAcceleration(sensor(100000, 8), 100000);
    expect(e.snapshot(epoch + 100000, 100000).speedMps).toBeNull();
    e.receiveGps(gps(100100, 2), epoch + 100100, 100100);
    e.receiveAcceleration(sensor(100150), 100150);
    expect(e.snapshot(epoch + 100150, 100150).speedMps).toBe(2);
  });
  it.each([0.1, 0.5, 1])(
    'movimento lento %s m/s não é convertido automaticamente em zero',
    (v) => {
      const e = setup(v);
      for (let t = 50; t <= 900; t += 50) e.receiveAcceleration(sensor(t), t);
      expect(e.snapshot(epoch + 900, 900).speedMps).toBe(v);
      expect(e.snapshot(epoch + 900, 900).stationary).toBe(false);
    },
  );
  it('parada exige janela de sensores quietos e GPS estável; originais preservados', () => {
    const e = setup(0.1);
    for (let t = 50; t <= 2050; t += 50) {
      if (t % 1000 === 0) e.receiveGps(gps(t, 0.1), epoch + t, t);
      e.receiveAcceleration(sensor(t), t);
    }
    expect(e.snapshot(epoch + 2050, 2050)).toMatchObject({
      speedMps: 0,
      stationary: true,
    });
    e.setMode('pure');
    e.receiveGps(gps(2100, 0.1), epoch + 2100, 2100);
    expect(e.snapshot(epoch + 2100, 2100).speedMps).toBe(0.1);
  });
  it.each([0, 100, 250, 500])(
    'trajetória sintética com atraso GPS %s ms',
    (delay) => {
      const e = new SpeedEstimator();
      const truth = (t: number) =>
        t < 3000 ? 10 + 0.001 * t : t < 6000 ? 13 : 13 - (t - 6000) * 0.001;
      let maxError = 0;
      for (let t = 0; t <= 9000; t += 50) {
        if (t >= delay && (t - delay) % 1000 === 0)
          e.receiveGps(gps(t - delay, truth(t - delay)), epoch + t, t);
        e.receiveAcceleration(sensor(t, t < 3000 ? 1 : t < 6000 ? 0 : -1), t);
        const s = e.snapshot(epoch + t, t);
        if (s.speedMps !== null)
          maxError = Math.max(maxError, Math.abs(s.speedMps - truth(t)));
        if (delay > SPEED_CONFIG.sensorAgeMs)
          expect(s.source).not.toBe('assisted');
      }
      // Erro absoluto nesta simulação ideal; não representa precisão física.
      expect(maxError).toBeLessThanOrEqual(delay > 350 ? 1.5 : 0.4);
    },
  );
});
