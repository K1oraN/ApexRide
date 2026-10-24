export const ELIGIBILITY = {
  version: 1,
  minActiveMs: 60_000,
  minDistanceMeters: 100,
  minPoints: 10,
  maxAccuracy: 30,
  minCoverage: 0.5,
  maxGapMs: 30_000,
} as const;

export function levelFor(
  xp: number,
  thresholds = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700],
  extensionStep = 550,
) {
  if (
    !Number.isSafeInteger(xp) ||
    xp < 0 ||
    !Number.isSafeInteger(extensionStep) ||
    extensionStep <= 0 ||
    thresholds[0] !== 0 ||
    thresholds.some(
      (v, i) =>
        !Number.isSafeInteger(v) || v < 0 || (i > 0 && v <= thresholds[i - 1]!),
    )
  )
    throw new Error('Configuração de progressão inválida');
  let index = thresholds.findIndex((v) => v > xp) - 1;
  let floor: number, next: number, level: number;
  const last = thresholds.at(-1)!;
  if (xp >= last) {
    const extra = Math.floor((xp - last) / extensionStep);
    level = Math.min(Number.MAX_SAFE_INTEGER, thresholds.length + extra);
    floor = last + extra * extensionStep;
    next = Math.min(Number.MAX_SAFE_INTEGER, floor + extensionStep);
  } else {
    index = Math.max(0, index);
    level = index + 1;
    floor = thresholds[index]!;
    next = thresholds[index + 1]!;
  }
  return {
    level,
    totalXp: xp,
    levelFloor: floor,
    nextLevelXp: next,
    remainingXp: next - xp,
    percent:
      next === floor
        ? 100
        : Math.min(100, (100 * (xp - floor)) / (next - floor)),
  };
}
export function displacementBand(cc: unknown) {
  const n = Number(cc);
  return !Number.isFinite(n) || n <= 0
    ? 'unknown'
    : n <= 300
      ? 'up-to-300'
      : n <= 600
        ? '301-600'
        : n <= 1000
          ? '601-1000'
          : 'over-1000';
}
export function qualityState(b: {
  activeMs: number;
  distance: number;
  points: number;
  accuracy: number;
  coverage: number;
  maxGap: number;
  deleted: boolean;
  overlap: boolean;
  future: boolean;
}) {
  if (b.deleted)
    return { state: 'revoked', reason: 'Atividade excluída.' } as const;
  if (
    b.activeMs < ELIGIBILITY.minActiveMs ||
    b.distance < ELIGIBILITY.minDistanceMeters ||
    b.points < ELIGIBILITY.minPoints
  )
    return {
      state: 'ineligible',
      reason: 'Dados insuficientes para reconhecer uma atividade.',
    } as const;
  if (
    b.overlap ||
    b.future ||
    b.accuracy > ELIGIBILITY.maxAccuracy ||
    b.coverage < ELIGIBILITY.minCoverage ||
    b.maxGap > ELIGIBILITY.maxGapMs
  )
    return {
      state: 'pending',
      reason:
        'Qualidade ou consistência aguardando validação; atividade preservada.',
    } as const;
  return {
    state: 'eligible',
    reason: 'Atividade GPS validada; sensores opcionais.',
  } as const;
}
