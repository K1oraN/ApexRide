import {
  MOTION_RULES,
  type Calibration,
  type Mount,
  type Vector,
} from '@apex-ride/ride-core/motion';
import { cross, dot, norm, scale, subtract } from './normalize';
import type { RawMotion } from './types';

// Moto: X frente, Y esquerda, Z cima (referencial destro).
// Montagem: tela para cima; topo OU borda direita apontados à frente.
export function mountingBasis(
  gravity: Vector,
  mount: Mount,
): Calibration['basis'] {
  if (!['top-forward', 'right-forward'].includes(mount))
    throw new Error('Montagem não suportada.');
  const up = scale(gravity, 1 / norm(gravity));
  if (!up.every(Number.isFinite) || up[2] < Math.cos(Math.PI / 4))
    throw new Error('Monte a tela voltada para cima, até 45° da horizontal.');
  const heading: Vector = mount === 'top-forward' ? [0, 1, 0] : [1, 0, 0];
  const projected = subtract(heading, scale(up, dot(heading, up)));
  const forward = scale(projected, 1 / norm(projected));
  return [forward, cross(up, forward), up];
}
export const toBike = (v: Vector, basis: Calibration['basis']): Vector =>
  basis.map((axis) => dot(v, axis)) as Vector;

export class CalibrationWindow {
  private samples: RawMotion[] = [];
  constructor(
    readonly mount: Mount,
    readonly started: number,
  ) {}
  add(s: RawMotion) {
    if (s.monotonicMs < this.started || s.monotonicMs > this.started + 6000)
      return;
    if (
      s.monotonicMs - (this.samples.at(-1)?.monotonicMs ?? -Infinity) >= 40 &&
      this.samples.length < 151
    )
      this.samples.push(s);
  }
  complete(at: number): Calibration {
    const samples = this.samples;
    if (
      samples.length < 40 ||
      samples.at(-1)!.monotonicMs - samples[0]!.monotonicMs < 2400
    )
      throw new Error(
        'Dados insuficientes: mantenha os sensores ativos por pelo menos 2,4 segundos.',
      );
    if (
      samples.some(
        (s, i) =>
          !s.gravity ||
          !s.acceleration ||
          !s.angular ||
          ![...s.gravity, ...s.acceleration, ...s.angular, s.monotonicMs].every(
            Number.isFinite,
          ) ||
          (i > 0 && s.monotonicMs - samples[i - 1]!.monotonicMs > 250),
      )
    )
      throw new Error(
        'Calibração exige aceleração linear, gravidade e giroscópio contínuos. GPS pode continuar sozinho.',
      );
    const mean = (field: 'gravity' | 'acceleration'): Vector =>
      [0, 1, 2].map(
        (i) => samples.reduce((n, s) => n + s[field]![i]!, 0) / samples.length,
      ) as Vector;
    const gravity = mean('gravity');
    const bias = mean('acceleration');
    if (
      Math.abs(norm(gravity) - MOTION_RULES.gravity) > 0.8 ||
      norm(bias) > 0.3 ||
      samples.some(
        (s) =>
          norm(s.angular!) > 3 ||
          norm(s.acceleration!) > 0.5 ||
          norm(subtract(s.gravity!, gravity)) > 0.35 ||
          s.screenAngle !== samples[0]!.screenAngle,
      )
    )
      throw new Error(
        'Aparelho instável ou moto em movimento. Pare, mantenha a moto vertical e tente novamente.',
      );
    const orientations = samples
      .map((s) => s.orientation)
      .filter((o) => o?.beta !== null && o?.gamma !== null && o !== null);
    if (orientations.length > 1) {
      const first = orientations[0]!;
      if (
        orientations.some(
          (o) =>
            Math.abs(o!.beta! - first.beta!) > 2 ||
            Math.abs(o!.gamma! - first.gamma!) > 2,
        )
      )
        throw new Error(
          'Orientação instável. Tente calibrar novamente com o aparelho parado.',
        );
    }
    return {
      mount: this.mount,
      at,
      version: 'motion-1',
      valid: true,
      screenAngle: samples[0]!.screenAngle,
      basis: mountingBasis(gravity, this.mount),
      bias,
    };
  }
}
