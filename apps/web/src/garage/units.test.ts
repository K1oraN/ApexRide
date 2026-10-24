import { describe, it, expect } from 'vitest';
import { powerToKw, torqueToNm } from './units';
describe('Conversões de referência da ficha', () => {
  it('distingue cv de hp, mantém kW e não modifica medidas de peso', () => {
    expect(powerToKw(1, 'cv')).toBeCloseTo(0.73549875, 8);
    expect(powerToKw(1, 'hp')).toBeCloseTo(0.74569987158, 8);
    expect(powerToKw(31, 'kW')).toBe(31);
    expect(powerToKw(1, 'hp')).not.toBe(powerToKw(1, 'cv'));
  });
  it('usa gravidade padrão na conversão do torque e rejeita valores inválidos', () => {
    expect(torqueToNm(1, 'kgf·m')).toBeCloseTo(9.80665, 8);
    expect(torqueToNm(20, 'N·m')).toBe(20);
    expect(() => powerToKw(NaN, 'cv')).toThrow();
    expect(() => torqueToNm(-1, 'N·m')).toThrow();
  });
});
