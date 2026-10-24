import { describe, it, expect } from 'vitest';
import {
  levelFor,
  qualityState,
  displacementBand,
} from '../src/modules/gamification/rules.js';
describe('21A níveis e elegibilidade', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [101, 2],
    [249, 2],
    [250, 3],
    [2700, 10],
    [3250, 11],
    [1_000_000, 1823],
  ])('calcula XP %i', (xp, level) => expect(levelFor(xp).level).toBe(level));
  it('progresso exato e extensão configurável', () => {
    expect(levelFor(175)).toMatchObject({
      level: 2,
      remainingXp: 75,
      percent: 50,
    });
    expect(levelFor(900, [0, 100, 500, 900], 1000)).toMatchObject({
      level: 4,
      nextLevelXp: 1900,
    });
  });
  it.each([-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 0.5])(
    'rejeita XP inválido %s',
    (xp) => expect(() => levelFor(xp)).toThrow(),
  );
  it('rejeita configuração inconsistente', () => {
    expect(() => levelFor(0, [0, 0])).toThrow();
    expect(() => levelFor(0, [10])).toThrow();
    expect(() => levelFor(0, [0], 0)).toThrow();
  });
  it('mantém números seguros no teto da representação', () => {
    const p = levelFor(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(p.nextLevelXp)).toBe(true);
    expect(p.remainingXp).toBe(0);
    expect(p.percent).toBe(100);
  });
  const valid = {
    activeMs: 120000,
    distance: 300,
    points: 60,
    accuracy: 8,
    coverage: 0.98,
    maxGap: 2000,
    deleted: false,
    overlap: false,
    future: false,
  };
  it('GPS puro é elegível sem sensores nem velocidade', () =>
    expect(qualityState(valid).state).toBe('eligible'));
  it.each([{ activeMs: 1000 }, { distance: 10 }, { points: 2 }])(
    'recusa registro insuficiente %j',
    (b) => expect(qualityState({ ...valid, ...b }).state).toBe('ineligible'),
  );
  it.each([
    { accuracy: 40 },
    { coverage: 0.1 },
    { maxGap: 31000 },
    { overlap: true },
    { future: true },
  ])('preserva dúvida como pendente %j', (b) =>
    expect(qualityState({ ...valid, ...b }).state).toBe('pending'),
  );
  it('exclusão revoga', () =>
    expect(qualityState({ ...valid, deleted: true }).state).toBe('revoked'));
  it.each([
    [null, 'unknown'],
    [300, 'up-to-300'],
    [301, '301-600'],
    [600, '301-600'],
    [1000, '601-1000'],
    [1001, 'over-1000'],
  ])('faixa de cilindrada %s', (cc, band) =>
    expect(displacementBand(cc)).toBe(band),
  );
});
