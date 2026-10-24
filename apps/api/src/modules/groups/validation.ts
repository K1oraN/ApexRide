import { BIKE_CATEGORIES } from '@apex-ride/ride-core/comparison';
import { AuthError } from '../auth/validation.js';
import { id, object, text } from '../social/validation.js';
export const GROUP_LIMITS = {
  name: 100,
  description: 2000,
  rules: 20,
  rule: 500,
};
export const STATES =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(
    ' ',
  );
export function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (!values.includes(v as T))
    throw new AuthError(400, 'Configuração inválida.');
  return v as T;
}
export function boolean(v: unknown): boolean {
  if (typeof v !== 'boolean')
    throw new AuthError(400, 'Configuração inválida.');
  return v;
}
export function settings(value: unknown) {
  const b = object(value);
  if (
    Object.keys(b).some(
      (k) =>
        ![
          'creationKey',
          'name',
          'description',
          'privacyType',
          'discoveryMode',
          'joinPolicy',
          'postingPolicy',
          'membersCanInvite',
          'city',
          'state',
          'categories',
          'rules',
          'confirmPrivacy',
        ].includes(k),
    )
  )
    throw new AuthError(400, 'Campo de grupo inválido.');
  const privacy = choice(b.privacyType, ['public', 'private']);
  const discovery = choice(b.discoveryMode, ['listed', 'unlisted']);
  if (privacy === 'public' && discovery !== 'listed')
    throw new AuthError(400, 'Grupo público deve ser listado.');
  const cats = b.categories ?? [],
    rules = b.rules ?? [];
  if (
    !Array.isArray(cats) ||
    cats.length > BIKE_CATEGORIES.length ||
    cats.some((v) => !BIKE_CATEGORIES.includes(v)) ||
    new Set(cats).size !== cats.length
  )
    throw new AuthError(400, 'Categorias inválidas.');
  if (!Array.isArray(rules) || rules.length > GROUP_LIMITS.rules)
    throw new AuthError(400, 'Use até 20 regras.');
  const state = text(b.state ?? '', 2).toUpperCase();
  if (state && !STATES.includes(state))
    throw new AuthError(400, 'Estado inválido.');
  return {
    name: text(b.name, GROUP_LIMITS.name, true),
    description: text(b.description ?? '', GROUP_LIMITS.description),
    privacy,
    discovery,
    join: choice(b.joinPolicy, ['immediate', 'approval']),
    posting: choice(b.postingPolicy ?? 'members', ['members', 'staff']),
    invites: boolean(b.membersCanInvite ?? false),
    city: text(b.city ?? '', 100),
    state,
    categories: cats as string[],
    rules: rules.map((r) => text(r, GROUP_LIMITS.rule, true)),
  };
}
export function acceptance(value: unknown, version: number) {
  const b = object(value);
  if (b.acceptRules !== true || b.rulesVersion !== version)
    throw new AuthError(
      409,
      'Confirme a aceitação da versão atual das regras.',
    );
}
export function creationKey(value: unknown) {
  return id(object(value).creationKey);
}
export function expiry(value: unknown, maxDays = 30) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    Date.parse(value) <= Date.now() ||
    Date.parse(value) > Date.now() + maxDays * 86400000
  )
    throw new AuthError(
      400,
      `Informe expiração futura de até ${maxDays} dias.`,
    );
  return new Date(value);
}
