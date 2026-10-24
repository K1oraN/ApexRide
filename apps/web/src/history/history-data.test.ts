import { describe, it, expect } from 'vitest';
import { trackPreview } from '@apex-ride/ride-core/history';
import {
  gpsChart,
  assistedChart,
  motionChart,
} from '@apex-ride/ride-core/charts';
import type { RidePoint } from '@apex-ride/ride-core';
import { periodDates, historyParams } from './filters';
const point = (i: number, segment = 0): RidePoint => ({
  latitude: -9.66,
  longitude: -35.73 + i * 0.00001,
  timestamp: 100000 + i * 1000,
  accuracy: 5,
  speed: i === 23 ? 20 : 10,
  heading: 90,
  altitude: null,
  segment,
});
describe('12A períodos combináveis', () => {
  it('converte período e intervalo inclusivo de datas', () => {
    expect(
      periodDates('7', '', '', new Date('2026-10-23T12:00:00Z')).from,
    ).toBe('2026-10-16T12:00:00.000Z');
    const d = periodDates('custom', '2026-10-01', '2026-10-02');
    expect(Date.parse(d.to) - Date.parse(d.from)).toBe(2 * 86400000);
    expect(
      historyParams(
        new URLSearchParams('mode=pista&period=30&sync=pending'),
      ).get('sync'),
    ).toBe(null);
  });
});
describe('12B mapa e gráficos usam amostras originais', () => {
  it('preserva segmentos e lacunas na redução limitada', () => {
    const points = Array.from({ length: 50000 }, (_, i) =>
      point(i, i < 25000 ? 0 : 1),
    );
    const result = trackPreview(points, 1000);
    expect(
      result.segments.reduce((n, g) => n + g.points.length, 0),
    ).toBeLessThanOrEqual(1000);
    expect(result.originalPoints).toBe(50000);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.points[0]).toBe(points[0]);
    expect(result.segments.at(-1)!.points.at(-1)).toBe(points.at(-1));
    expect(points).toHaveLength(50000);
  });
  it('não conecta segmentos omitidos quando há muitas interrupções', () => {
    const result = trackPreview(
      Array.from({ length: 100 }, (_, i) => point(i, i)),
      20,
    );
    expect(result.omittedSegments).toBe(90);
    expect(result.segments.every((g) => g.points.length === 1)).toBe(true);
  });
  it('quebra lacuna temporal mesmo sem troca explícita de segmento', () => {
    expect(trackPreview([point(0), point(1), point(30)]).segments).toHaveLength(
      2,
    );
  });
  it('GPS mantém timestamp, picos e separações em até 600 amostras', () => {
    const points = Array.from({ length: 3000 }, (_, i) =>
      point(i, i < 1500 ? 0 : 1),
    );
    const chart = gpsChart(points);
    expect(chart.length).toBeLessThanOrEqual(600);
    expect(chart.some((p) => p.value === 72)).toBe(true);
    expect(new Set(chart.map((p) => p.segment)).size).toBe(2);
    expect(chart[0]!.timestamp).toBe(points[0]!.timestamp);
  });
  it('séries ausentes permanecem vazias, sem zeros inventados', () => {
    expect(assistedChart([], 100000)).toEqual([]);
    expect(motionChart([], 100000, 'force')).toEqual([]);
    expect(motionChart([], 100000, 'lean')).toEqual([]);
  });
});
