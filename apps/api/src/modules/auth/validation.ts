export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (
  message = 'Dados inválidos. Confira os campos.',
): never => {
  throw new AuthError(400, message);
};
export function body(
  value: unknown,
  allowed: string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    return fail();
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  min: number,
  max: number,
  trim = true,
): string {
  if (typeof value !== 'string') return fail();
  const result = trim ? value.trim().normalize('NFC') : value;
  if (
    [...result].length < min ||
    [...result].length > max ||
    [...result].some(
      (char) =>
        char.codePointAt(0)! < 32 ||
        (char.codePointAt(0)! >= 127 && char.codePointAt(0)! <= 159),
    )
  )
    return fail();
  return result;
}
export function displayName(value: unknown) {
  const name = text(value, 2, 60);
  if (!/^[\p{L}\p{M}\p{N} ._'’-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name))
    return fail('Nome de exibição inválido.');
  return name;
}
export function username(value: unknown) {
  const name = text(value, 3, 30).toLowerCase();
  if (
    !/^[a-z0-9_]{3,30}$/.test(name) ||
    ['me', 'auth', 'admin', 'api'].includes(name)
  )
    return fail('Use 3 a 30 letras, números ou sublinhado no nome de usuário.');
  return name;
}
export function email(value: unknown) {
  const address = text(value, 3, 254).toLowerCase();
  if (
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      address,
    ) ||
    address.split('@')[0]!.length > 64 ||
    address.startsWith('.') ||
    address.split('@')[0]!.endsWith('.') ||
    address.includes('..') ||
    address
      .split('@')[1]!
      .split('.')
      .some((label) => label.length > 63)
  )
    return fail('Informe um e-mail válido.');
  return address;
}
export const password = (value: unknown) => text(value, 15, 128, false);
const states =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(
    ' ',
  );
export function state(value: unknown) {
  const uf = text(value ?? '', 0, 2).toUpperCase();
  if (uf && !states.includes(uf)) return fail('Selecione um estado válido.');
  return uf;
}
export function visibility(value: unknown) {
  if (value !== 'public' && value !== 'private') return fail();
  return value;
}
export function token(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new AuthError(400, 'Link inválido ou expirado.');
  return value;
}
