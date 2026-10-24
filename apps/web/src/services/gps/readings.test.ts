import { describe, expect, it } from 'vitest';
import { GPS_CONFIG } from './config';
import { normalizePosition, speedKmh, validateReading } from './readings';
import { testPosition } from './testFixtures';

describe('velocidade direta e normalização GPS', () => {
  it.each([
    [10, 36],
    [0, 0],
    [null, null],
    [-1, null],
    [NaN, null],
    [Infinity, null],
  ])('converte %s m/s para %s km/h', (input, expected) =>
    expect(speedKmh(input)).toBe(expected),
  );
  it('preserva precisão original, timestamp e campos ausentes', () => {
    const raw = testPosition({
      latitude: -9.123456789,
      speed: null,
      heading: null,
    });
    const reading = normalizePosition(raw);
    expect(reading.latitude).toBe(raw.coords.latitude);
    expect(reading.timestamp).toBe(raw.timestamp);
    expect(reading.speed).toBeNull();
    expect(reading.heading).toBeNull();
    expect(reading.altitude).toBeNull();
  });
  it('descarta campos opcionais inválidos sem criar números', () => {
    const reading = normalizePosition(
      testPosition({
        speed: -1,
        heading: 360,
        altitude: NaN,
        altitudeAccuracy: -1,
      }),
    );
    expect([
      reading.speed,
      reading.heading,
      reading.altitude,
      reading.altitudeAccuracy,
    ]).toEqual([null, null, null, null]);
  });
});

describe('qualidade das leituras', () => {
  const now = 1_800_000_000_000;
  const reading = normalizePosition(testPosition({}, now));
  it('aceita um ponto recente preciso', () =>
    expect(validateReading(reading, null, now)).toBe('good'));
  it('reduz qualidade com incerteza acima de 50 metros', () =>
    expect(validateReading({ ...reading, accuracy: 100 }, null, now)).toBe(
      'reduced',
    ));
  it.each([
    { latitude: 91 },
    { latitude: NaN },
    { longitude: -181 },
    { longitude: Infinity },
    { accuracy: -1 },
    { accuracy: NaN },
    { timestamp: NaN },
    { timestamp: 0 },
    { timestamp: now + 5_001 },
  ])('rejeita leitura inválida: %j', (patch) =>
    expect(validateReading({ ...reading, ...patch }, null, now)).toBe(
      'invalid',
    ),
  );
  it('aceita os limites geográficos e precisão zero', () =>
    expect(
      validateReading(
        { ...reading, latitude: 90, longitude: 180, accuracy: 0 },
        null,
        now,
      ),
    ).toBe('good'));
  it('identifica leitura antiga', () =>
    expect(validateReading(reading, null, now + GPS_CONFIG.staleAfterMs)).toBe(
      'stale',
    ));
  it('rejeita timestamp repetido', () =>
    expect(validateReading(reading, reading, now)).toBe('duplicate'));
  it('rejeita leitura fora de ordem', () =>
    expect(
      validateReading({ ...reading, timestamp: now - 1 }, reading, now),
    ).toBe('out-of-order'));
  it('rejeita salto incompatível com deslocamento', () =>
    expect(
      validateReading(
        { ...reading, latitude: -9, timestamp: now + 1_000 },
        reading,
        now + 1_000,
      ),
    ).toBe('jump'));
  it('não rejeita deslocamento coberto pela incerteza', () =>
    expect(
      validateReading(
        { ...reading, latitude: -9.6649, timestamp: now + 1 },
        reading,
        now + 1,
      ),
    ).toBe('good'));
});
