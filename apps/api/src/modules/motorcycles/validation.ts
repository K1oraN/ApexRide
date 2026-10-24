import { AuthError, body, text } from '../auth/validation.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export function motorcycleId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new AuthError(404, 'Moto não encontrada.');
  return value;
}
export function motorcycleData(value: unknown, partial = false) {
  const data = body(value, ['brand', 'model', 'year', 'displacementCc']);
  if (!Object.keys(data).length)
    throw new AuthError(400, 'Informe os dados da moto.');
  const result: {
    brand?: string;
    model?: string;
    year?: number;
    displacementCc?: number;
  } = {};
  for (const [name, max, label] of [
    ['brand', 60, 'Marca'],
    ['model', 100, 'Modelo'],
  ] as const) {
    if (partial && !(name in data)) continue;
    try {
      result[name] = text(data[name], 1, max);
    } catch {
      throw new AuthError(
        400,
        `${label}: informe de 1 a ${max} caracteres válidos.`,
      );
    }
  }
  for (const [name, min, max, label] of [
    ['year', 1885, new Date().getFullYear() + 1, 'Ano'],
    ['displacementCc', 1, 10000, 'Cilindrada (cc)'],
  ] as const) {
    if (partial && !(name in data)) continue;
    const n = data[name];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max)
      throw new AuthError(
        400,
        `${label}: informe um inteiro entre ${min} e ${max}.`,
      );
    result[name] = n;
  }
  return result;
}
