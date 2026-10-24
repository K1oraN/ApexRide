import {
  MOTION_RULES,
  type Calibration,
  type MotionSample,
} from '@apex-ride/ride-core/motion';
import { norm, subtract } from './normalize';
import { toBike } from './calibration';
import type { RawMotion } from './types';

/** Filtro temporal: mediana de 3 + passa-baixas tau=150ms; 200ms de
 * persistência de sinal antes de aceitar G; aquecimento de 400ms por segmento. */
export class MotionProcessor {
  private last: number | null = null;
  private start = 0;
  private recent: number[] = [];
  private filtered = 0;
  private sign = 0;
  private signSince = 0;
  reset() {
    this.last = null;
    this.recent = [];
    this.sign = 0;
    this.filtered = 0;
  }
  process(
    raw: RawMotion,
    c: Calibration | null,
  ): Pick<
    MotionSample,
    | 'longitudinal'
    | 'accelerationG'
    | 'brakingG'
    | 'lean'
    | 'quality'
    | 'source'
  > {
    const unavailable = (quality: MotionSample['quality']) => ({
      longitudinal: null,
      accelerationG: null,
      brakingG: null,
      lean: null,
      quality,
      source: 'unavailable' as const,
    });
    if (!c?.valid || raw.screenAngle !== c.screenAngle) {
      this.reset();
      return unavailable('uncalibrated');
    }
    if (
      !raw.acceleration ||
      !raw.angular ||
      ![...raw.acceleration, ...raw.angular, raw.monotonicMs].every(
        Number.isFinite,
      ) ||
      norm(raw.angular) > 200 ||
      norm(raw.acceleration) > 3 * MOTION_RULES.gravity
    ) {
      this.reset();
      return unavailable('invalid');
    }
    const dt = this.last === null ? 0 : raw.monotonicMs - this.last;
    if ((this.last !== null && dt <= 0) || dt >= MOTION_RULES.gapMs) {
      this.reset();
      return unavailable('interrupted');
    }
    if (this.last === null) this.start = raw.monotonicMs;
    this.last = raw.monotonicMs;
    const longitudinal = toBike(subtract(raw.acceleration, c.bias), c.basis)[0];
    this.recent.push(longitudinal);
    if (this.recent.length > 3) this.recent.shift();
    const sorted = [...this.recent].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.filtered += (dt / (150 + dt)) * (median - this.filtered);
    if (
      Math.abs(longitudinal - median) > 8 ||
      this.recent.length < 3 ||
      raw.monotonicMs - this.start < 400
    )
      return unavailable('invalid');
    const sign = Math.abs(this.filtered) < 0.15 ? 0 : Math.sign(this.filtered);
    if (sign !== this.sign) {
      this.sign = sign;
      this.signSince = raw.monotonicMs;
    }
    if (sign !== 0 && raw.monotonicMs - this.signSince < 200)
      return unavailable('invalid');
    const value = sign === 0 ? 0 : this.filtered;
    if (!Number.isFinite(value) || Math.abs(value) > 3 * MOTION_RULES.gravity)
      return unavailable('invalid');
    return {
      longitudinal: value,
      accelerationG: Math.max(0, value) / MOTION_RULES.gravity,
      brakingG: Math.max(0, -value) / MOTION_RULES.gravity,
      lean: null,
      quality: 'limited',
      source: 'browser-linear',
    };
  }
}

/** Bancada apenas: rotação relativa entre bases ortonormais, esquerda positiva.
 * Não promovida a inclinação dinâmica: browser pode fundir gravidade aparente. */
export function benchLean(
  reference: Calibration['basis'],
  current: Calibration['basis'],
): number {
  const up = current[2];
  const left = reference[1];
  const vertical = reference[2];
  const dot = (a: number[], b: number[]) =>
    a.reduce((s, n, i) => s + n * b[i]!, 0);
  return (Math.atan2(dot(up, left), dot(up, vertical)) * 180) / Math.PI;
}
