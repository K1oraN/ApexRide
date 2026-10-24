import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeedTelemetry } from './telemetry';
import { GpsPreview } from '../gps/preview';
import { MotionTelemetry } from '../motion/telemetry';

describe('Ciclo de vida e memória do processamento de velocidade', () => {
  let speed: SpeedTelemetry;
  let off: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    speed = new SpeedTelemetry();
    off = speed.connect(new GpsPreview(), new MotionTelemetry());
  });
  afterEach(() => {
    off();
    vi.useRealTimers();
  });
  it('limita histórico e informa truncamento sem crescer a memória', () => {
    speed.session('running', Date.now());
    vi.advanceTimersByTime(18001000);
    expect(speed.finish()!.samples).toHaveLength(18000);
    expect(speed.historyIncomplete).toBe(true);
  });
  it('relógio civil alterado não produz intervalos negativos e pausa não coleta', () => {
    const start = Date.now();
    speed.session('running', start);
    vi.advanceTimersByTime(1000);
    vi.setSystemTime(start - 5000);
    vi.advanceTimersByTime(1000);
    speed.session('paused', start);
    const saved = speed.finish()!;
    expect(saved.samples.map((s) => s.relativeMs)).toEqual([0, 1000, 2000]);
    vi.advanceTimersByTime(10000);
    expect(speed.finish()!.samples).toEqual(saved.samples);
    speed.clear();
    expect(speed.finish()).toBeUndefined();
  });
  it('preferência manual não muda por limpeza ou falha e desconectar libera timer', () => {
    speed.setMode('pure');
    speed.clear();
    expect(speed.getSnapshot().preference).toBe('pure');
    off();
    expect(vi.getTimerCount()).toBe(0);
  });
});
