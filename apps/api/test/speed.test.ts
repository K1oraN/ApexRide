import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RidePayload } from '@apex-ride/ride-core';
import type { SpeedPayload } from '@apex-ride/ride-core/speed';
import { validateRide } from '../src/modules/rides/validation.js';

function activity(): RidePayload {
  const start = Date.now() - 10000;
  return {
    clientId: randomUUID(),
    motorcycleId: randomUUID(),
    mode: 'misto',
    visibility: 'private',
    startedAt: start,
    endedAt: start + 5000,
    intervals: [{ start, end: start + 5000 }],
    points: [
      {
        latitude: -9.6,
        longitude: -35.7,
        accuracy: 5,
        speed: 10,
        timestamp: start,
        heading: null,
        altitude: null,
        segment: 0,
      },
    ],
    speedProcessing: {
      version: 'speed-1',
      truncated: false,
      samples: [
        {
          relativeMs: 100,
          gpsTimestamp: start,
          speedMps: 11,
          source: 'assisted',
          state: 'assisted',
          reason: null,
          stationary: false,
        },
      ],
    },
  };
}
describe('Contrato opcional de velocidade assistida', () => {
  it('preserva GPS original e máxima consolidada, aceita atividades antigas', () => {
    const b = activity();
    expect(validateRide(b).metrics.maximumKmh).toBe(36);
    expect(validateRide(b).payload.speedProcessing!.samples[0]!.speedMps).toBe(
      11,
    );
    expect(b.points[0]!.speed).toBe(10);
    delete b.speedProcessing;
    expect(validateRide(b).payload.speedProcessing).toBeUndefined();
  });
  it.each([NaN, Infinity, -1, 101, '10'])('rejeita velocidade %s', (value) => {
    const b = activity();
    b.speedProcessing!.samples[0]!.speedMps = value as number;
    expect(() => validateRide(b)).toThrow(/velocidade/);
  });
  it.each([
    'version',
    'truncated',
    'samples',
    'state',
    'source',
    'reason',
    'time',
    'duplicate',
    'order',
    'future-gps',
    'unknown-gps',
    'old-gps',
    'pause',
    'null-speed',
    'drift',
    'gps-forged',
    'stationary',
  ])('rejeita contrato %s', (condition) => {
    const b = activity(),
      p = b.speedProcessing!,
      s = p.samples[0]!;
    switch (condition) {
      case 'version':
        p.version = 'unknown' as never;
        break;
      case 'truncated':
        p.truncated = null as never;
        break;
      case 'samples':
        p.samples = Array(18001).fill(s);
        break;
      case 'state':
        s.state = 'certified' as never;
        break;
      case 'source':
        s.source = 'raw' as never;
        break;
      case 'reason':
        s.reason = 'unknown' as never;
        break;
      case 'time':
        s.relativeMs = -1;
        break;
      case 'duplicate':
        p.samples.push({ ...s });
        break;
      case 'order':
        p.samples.push({ ...s, relativeMs: 10 });
        break;
      case 'future-gps':
        s.gpsTimestamp = b.startedAt + 200;
        break;
      case 'unknown-gps':
        s.gpsTimestamp = b.startedAt - 100;
        break;
      case 'old-gps':
        s.relativeMs = 4000;
        break;
      case 'pause':
        b.intervals[0]!.end = b.startedAt + 50;
        break;
      case 'null-speed':
        s.speedMps = null;
        break;
      case 'drift':
        s.speedMps = 16;
        break;
      case 'gps-forged':
        s.source = 'gps';
        s.state = 'pure-auto';
        break;
      case 'stationary':
        s.stationary = true;
        break;
    }
    expect(() => validateRide(b)).toThrow(/velocidade/);
  });
  it('aceita amostra indisponível, GPS puro e histórico incompleto explícito', () => {
    const b = activity();
    b.speedProcessing = {
      version: 'speed-1',
      truncated: true,
      samples: [
        {
          relativeMs: 0,
          gpsTimestamp: null,
          speedMps: null,
          source: 'unavailable',
          state: 'waiting',
          reason: 'gps-missing',
          stationary: false,
        },
        {
          relativeMs: 100,
          gpsTimestamp: b.startedAt,
          speedMps: 10,
          source: 'gps',
          state: 'pure-selected',
          reason: 'selected',
          stationary: false,
        },
      ],
    };
    expect(validateRide(b).payload.speedProcessing).toEqual(b.speedProcessing);
  });
  it('valida todos os 18000 registros sem truncar silenciosamente', () => {
    const b = activity();
    b.endedAt = b.startedAt + 18000;
    b.intervals[0]!.end = b.endedAt;
    const p: SpeedPayload = {
      version: 'speed-1',
      truncated: false,
      samples: Array.from({ length: 18000 }, (_, i) => ({
        relativeMs: i,
        gpsTimestamp: null,
        speedMps: null,
        source: 'unavailable',
        state: 'waiting',
        reason: 'gps-missing',
        stationary: false,
      })),
    };
    b.speedProcessing = p;
    expect(
      validateRide(b, b.endedAt).payload.speedProcessing!.samples,
    ).toHaveLength(18000);
  });
});
