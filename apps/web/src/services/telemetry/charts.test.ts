import { describe, expect, it } from 'vitest';
import type { RidePoint } from '@apex-ride/ride-core';
import { chartSeries, gpsChart, assistedChart, motionChart } from './charts';
describe('Séries reais e redução para gráficos', () => {
  it('série assistida não conecta pausa curta entre referências GPS distintas', () => {
    const samples = [0, 200].map((relativeMs) => ({
      relativeMs,
      gpsTimestamp: 1000 + relativeMs,
      speedMps: 10,
      source: 'assisted' as const,
      state: 'assisted' as const,
      reason: null,
      stationary: false,
    }));
    const points = samples.map((s, i): RidePoint => ({
      timestamp: s.gpsTimestamp,
      segment: i,
      latitude: -9.6,
      longitude: -35.7,
      accuracy: 3,
      speed: 10,
      heading: null,
      altitude: null,
    }));
    const series = assistedChart(samples, 1000, points);
    expect(series).toHaveLength(2);
    expect(series[0]!.segment).not.toBe(series[1]!.segment);
  });
  it('preserva timestamps, valores e separa lacunas e segmentos', () => {
    const series = chartSeries(
      [
        { timestamp: 1000, value: 10, segment: 0 },
        { timestamp: 1500, value: null, segment: 0 },
        { timestamp: 2000, value: 12, segment: 0 },
        { timestamp: 5000, value: 15, segment: 0 },
        { timestamp: 5500, value: 16, segment: 1 },
      ],
      1500,
    );
    expect(series.map((p) => p.timestamp)).toEqual([1000, 2000, 5000, 5500]);
    expect(new Set(series.map((p) => p.segment)).size).toBe(4);
    expect(series.some((p) => p.value === 0)).toBe(false);
  });
  it('descarta timestamps fora de ordem, NaN, infinito e valores ausentes', () => {
    const s = chartSeries(
      [
        { timestamp: 10, value: 1, segment: 0 },
        { timestamp: 5, value: 2, segment: 0 },
        { timestamp: 20, value: NaN, segment: 0 },
        { timestamp: 30, value: Infinity, segment: 0 },
        { timestamp: NaN, value: 3, segment: 0 },
        { timestamp: 40, value: 4, segment: 0 },
      ],
      1500,
    );
    expect(s.map((p) => p.value)).toEqual([1, 4]);
    expect(s[0]!.segment).not.toBe(s[1]!.segment);
  });
  it('reduz 50000 pontos mantendo extremos, início/fim e lacunas', () => {
    const input = Array.from({ length: 50000 }, (_, n) => ({
      timestamp: n * 500,
      value: n === 25000 ? 100 : n === 20000 ? -50 : n === 10000 ? null : 10,
      segment: 0,
    }));
    const before = JSON.stringify(input);
    const s = chartSeries(input, 1500);
    expect(s.length).toBeLessThanOrEqual(600);
    expect(s[0]!.timestamp).toBe(0);
    expect(s.at(-1)!.timestamp).toBe(49999 * 500);
    expect(Math.max(...s.map((p) => p.value))).toBe(100);
    expect(Math.min(...s.map((p) => p.value))).toBe(-50);
    expect(new Set(s.map((p) => p.segment)).size).toBe(2);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('séries vazias não geram gráficos artificiais', () => {
    expect(gpsChart([])).toEqual([]);
    expect(assistedChart([], 1000)).toEqual([]);
    expect(motionChart([], 1000, 'lean')).toEqual([]);
  });
  it('GPS assistido é série opcional distinta, com lacunas de fallback', () => {
    const base = {
      gpsTimestamp: 1000,
      speedMps: 10,
      source: 'assisted' as const,
      state: 'assisted' as const,
      reason: null,
      stationary: false,
    };
    const s = assistedChart(
      [
        { ...base, relativeMs: 0 },
        { ...base, relativeMs: 200, source: 'gps' },
        { ...base, relativeMs: 400 },
      ],
      1000,
    );
    expect(s.map((p) => p.value)).toEqual([36, 36]);
    expect(s[0]!.segment).not.toBe(s[1]!.segment);
  });
});
