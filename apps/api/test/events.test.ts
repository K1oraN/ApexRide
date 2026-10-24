import { describe, it, expect } from 'vitest';
import {
  settings,
  timestamp,
  point,
} from '../src/modules/events/validation.js';
import { consent, position, approximate } from '../src/modules/events/live.js';
const now = Date.parse('2026-10-23T12:00:00.000Z');
const event = {
  title: 'Café em grupo',
  eventType: 'meetup',
  visibility: 'public',
  joinPolicy: 'immediate',
  city: 'Maceió',
  state: 'AL',
  meetingPoint: [-35.7, -9.6],
  meetingPointLabel: 'Praça',
  startsAt: '2026-10-24T12:00:00.000Z',
  endsAt: '2026-10-24T14:00:00.000Z',
  timezone: 'America/Maceio',
  confirmPoint: true,
};
describe('20A validação de eventos', () => {
  it('preserva UTC e fuso regional', () => {
    expect(
      settings({ ...event, timezone: 'America/Manaus' }, now).timezone,
    ).toBe('America/Manaus');
  });
  for (const input of [
    { title: '' },
    { startsAt: '2026-02-30T12:00:00.000Z' },
    { endsAt: event.startsAt },
    { timezone: 'Mars/X' },
    { meetingPoint: [181, 0] },
    { meetingPoint: [0, NaN] },
    { confirmPoint: false },
    { state: 'ZZ' },
    { capacity: 0 },
    { organizerId: 'other' },
    { visibility: 'group' },
    { groupId: 'other' },
    { routeId: 'other' },
  ])
    it(`rejeita ${JSON.stringify(input)}`, () => {
      expect(() => settings({ ...event, ...input }, now)).toThrow();
    });
  it('não aceita datas sem UTC ou coordenadas string', () => {
    expect(() => timestamp('2026-10-24T12:00')).toThrow();
    expect(() => point(['1', 2])).toThrow();
  });
});
describe('20C consentimento e minimização', () => {
  const c = {
    consent: true,
    consentVersion: 'live-v1',
    audience: 'organizers',
    precision: 'approximate',
    durationMinutes: 30,
  };
  it('exige consentimento e rejeita ativação em nome de terceiros', () => {
    expect(() => consent({ ...c, consent: false })).toThrow();
    expect(() => consent({ ...c, userId: 'other' })).toThrow();
  });
  for (const input of [
    { durationMinutes: 0 },
    { durationMinutes: 300 },
    { audience: 'public' },
    { precision: 'hidden' },
    { consentVersion: 'old' },
  ])
    it(`rejeita ${JSON.stringify(input)}`, () =>
      expect(() => consent({ ...c, ...input })).toThrow());
  it('aproxima antes do armazenamento e informa raio conservador', () => {
    const p = approximate(-35.712345, -9.678912, 12);
    expect(p).toEqual({ longitude: -35.71, latitude: -9.68, accuracy: 1600 });
  });
  const p = {
    sessionId: 'c36cac8a-31fd-4ac5-a8bd-c6cbb075656e',
    longitude: -35.7,
    latitude: -9.6,
    accuracy: 10,
    timestamp: now,
  };
  for (const input of [
    { timestamp: now - 10001 },
    { timestamp: now + 2001 },
    { accuracy: 201 },
    { longitude: 181 },
    { latitude: NaN },
    { speed: 10 },
    { userId: 'other' },
  ])
    it(`rejeita posição ${JSON.stringify(input)}`, () =>
      expect(() => position({ ...p, ...input }, now)).toThrow());
});
