import { describe, it, expect } from 'vitest';
import { toUtc, wallTime } from './timezone';
describe('Horário do evento independente do aparelho', () => {
  for (const [zone, hour] of [
    ['America/Maceio', '12'],
    ['America/Manaus', '13'],
    ['America/Rio_Branco', '14'],
    ['America/Noronha', '11'],
  ])
    it(`converte ${zone} para UTC e retorna horário regional`, () => {
      const utc = toUtc('2026-10-24T09:00', zone!);
      expect(utc).toBe(`2026-10-24T${hour}:00:00.000Z`);
      expect(wallTime(utc, zone!)).toBe('2026-10-24T09:00');
    });
  it('rejeita fuso inválido e horário inexistente durante mudança de fuso', () => {
    expect(() => toUtc('2026-10-24T09:00', 'Mars/Phobos')).toThrow();
    expect(() => toUtc('2026-03-08T02:30', 'America/New_York')).toThrow();
  });
});
