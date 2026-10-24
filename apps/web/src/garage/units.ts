/** SI conversions. Sources: NIST SP 811 appendix B; original source values remain unchanged. */
export function powerToKw(value: number, unit: 'cv' | 'hp' | 'kW') {
  if (!Number.isFinite(value) || value < 0)
    throw new Error('Potência inválida');
  return (
    value *
    (unit === 'cv' ? 0.73549875 : unit === 'hp' ? 0.7456998715822702 : 1)
  );
}
export function torqueToNm(value: number, unit: 'N·m' | 'kgf·m') {
  if (!Number.isFinite(value) || value < 0) throw new Error('Torque inválido');
  return value * (unit === 'kgf·m' ? 9.80665 : 1);
}
