import { AuthError } from '../auth/validation.js';
import { fields } from '../events/validation.js';
export { fields };
export const invalid = (message = 'Dados administrativos inválidos.') =>
  new AuthError(400, message);
export function id(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw invalid('Identificador inválido.');
  return value;
}
export function text(value: unknown, min = 5, max = 1000) {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max ||
    [...value].some((c) => {
      const n = c.charCodeAt(0);
      return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
    })
  )
    throw invalid('Informe texto válido e justificativa suficiente.');
  return value.trim();
}
export function choice<T extends string>(
  value: unknown,
  options: readonly T[],
): T {
  if (typeof value !== 'string' || !options.includes(value as T))
    throw invalid();
  return value as T;
}
export function integer(value: unknown, min = 1, max = 1000000) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw invalid();
  return value;
}
export function page(raw: unknown) {
  const q = fields(raw ?? {}, [
    'page',
    'search',
    'status',
    'from',
    'to',
    'userId',
  ]);
  const p = Number(q.page ?? 1);
  if (!Number.isInteger(p) || p < 1 || p > 1000)
    throw invalid('Página inválida.');
  return {
    offset: (p - 1) * 30,
    page: p,
    search: q.search === undefined ? '' : text(q.search, 0, 80),
    status: q.status === undefined ? '' : text(q.status, 0, 40),
    userId: q.userId === undefined ? null : id(q.userId),
    from: q.from === undefined ? null : date(q.from),
    to: q.to === undefined ? null : date(q.to),
  };
}
export function date(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw invalid('Data inválida.');
  return new Date(value);
}
