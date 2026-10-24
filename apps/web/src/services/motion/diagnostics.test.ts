import { describe, expect, it } from 'vitest';
import { MOTION_RULES } from '@apex-ride/ride-core/motion';
import { SensorDiagnostics } from './diagnostics';
import { raw } from './fixtures';

describe('diagnóstico individual, leituras sintéticas conhecidas', () => {
  it('não confunde detecção ou uma amostra com funcionamento', () => {
    const d = new SensorDiagnostics();
    expect(Object.values(d.snapshot(0))).toEqual([
      'not-tested',
      'not-tested',
      'not-tested',
    ]);
    d.observe(raw(0));
    expect(Object.values(d.snapshot(0))).toEqual([
      'insufficient',
      'insufficient',
      'insufficient',
    ]);
  });
  it('exige cadência mínima e aceita zero efetivamente medido', () => {
    const d = new SensorDiagnostics();
    for (const t of [0, 1, 2]) d.observe(raw(t));
    expect(d.snapshot(2).accelerometer).toBe('insufficient');
    d.observe(raw(100));
    expect(Object.values(d.snapshot(100))).toEqual([
      'working',
      'working',
      'working',
    ]);
  });
  it('não confirma giroscópio ou orientação com acelerômetro isolado', () => {
    const d = new SensorDiagnostics();
    for (const t of [0, 50, 100])
      d.observe(raw(t, { angular: null, orientation: null }));
    expect(d.snapshot(100)).toEqual({
      accelerometer: 'working',
      gyroscope: 'not-tested',
      orientation: 'not-tested',
    });
  });
  it('não repete a última orientação como se fosse uma nova leitura', () => {
    const d = new SensorDiagnostics();
    const orientation = raw(0).orientation;
    for (const t of [0, 50, 100]) d.observe(raw(t, { orientation }));
    expect(d.snapshot(100).orientation).toBe('insufficient');
  });
  it('avalia orientação mesmo sem amostras de movimento utilizáveis', () => {
    const d = new SensorDiagnostics();
    for (const t of [0, 50, 100]) d.observeOrientation(raw(t).orientation);
    expect(d.snapshot(100)).toEqual({
      accelerometer: 'not-tested',
      gyroscope: 'not-tested',
      orientation: 'working',
    });
  });
  it('expira cada canal mesmo quando outros continuam atualizando', () => {
    const d = new SensorDiagnostics();
    for (const t of [0, 50, 100]) d.observe(raw(t));
    d.observe(
      raw(100 + MOTION_RULES.gapMs, { angular: null, orientation: null }),
    );
    expect(d.snapshot(100 + MOTION_RULES.gapMs)).toEqual({
      accelerometer: 'insufficient',
      gyroscope: 'stale',
      orientation: 'stale',
    });
  });
  it('exige nova sequência após uma lacuna e limpa ao encerrar', () => {
    const d = new SensorDiagnostics();
    for (const t of [0, 50, 100]) d.observe(raw(t));
    const next = 100 + MOTION_RULES.gapMs;
    d.observe(raw(next));
    expect(d.snapshot(next).gyroscope).toBe('insufficient');
    for (const t of [next + 50, next + 100]) d.observe(raw(t));
    expect(d.snapshot(next + 100).gyroscope).toBe('working');
    d.clear();
    expect(d.snapshot(next + 100).gyroscope).toBe('not-tested');
  });
  it('mantém resultado limitado em série longa, sem guardar histórico bruto', () => {
    const d = new SensorDiagnostics();
    for (let i = 0; i < 216000; i++) d.observe(raw(i * 50));
    expect(Object.values(d.snapshot(215999 * 50))).toEqual([
      'working',
      'working',
      'working',
    ]);
  });
});
