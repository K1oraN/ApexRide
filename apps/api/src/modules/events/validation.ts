import { AuthError } from '../auth/validation.js';
import { id, object, text } from '../social/validation.js';
import { STATES } from '../groups/validation.js';
export const invalid = (message: string) => new AuthError(400, message);
export function choice<T extends string>(
  value: unknown,
  values: readonly T[],
): T {
  if (!values.includes(value as T)) throw invalid('Opção inválida.');
  return value as T;
}
export function fields(value: unknown, allowed: string[]) {
  const b = object(value);
  if (Object.keys(b).some((k) => !allowed.includes(k)))
    throw invalid('Campo não permitido.');
  return b;
}
export function timestamp(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)
  )
    throw invalid('Data UTC inválida.');
  return new Date(value);
}
export function point(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((x) => typeof x !== 'number' || !Number.isFinite(x)) ||
    Math.abs(value[0]) > 180 ||
    Math.abs(value[1]) > 85
  )
    throw invalid('Coordenadas inválidas.');
  return value as [number, number];
}
export function settings(value: unknown, now = Date.now()) {
  const b = fields(value, [
    'creationKey',
    'title',
    'description',
    'rules',
    'eventType',
    'visibility',
    'joinPolicy',
    'city',
    'state',
    'meetingPoint',
    'meetingPointLabel',
    'meetingReference',
    'startsAt',
    'endsAt',
    'timezone',
    'capacity',
    'groupId',
    'routeId',
    'confirmPoint',
    'revision',
    'confirmDisclosure',
  ]);
  if (text(b.title, 120, true).length < 3)
    throw invalid('O nome deve ter pelo menos três caracteres.');
  const startsAt = timestamp(b.startsAt),
    endsAt = timestamp(b.endsAt);
  if (
    endsAt.getTime() <= startsAt.getTime() ||
    endsAt.getTime() <= now ||
    endsAt.getTime() - startsAt.getTime() > 7 * 86400000
  )
    throw invalid(
      'Horários inválidos: encerramento futuro, após o início e até sete dias.',
    );
  const timezone = text(b.timezone, 80, true);
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(startsAt);
  } catch {
    throw invalid('Fuso horário inválido.');
  }
  if (b.confirmPoint !== true)
    throw invalid('Confirme o ponto de encontro que será divulgado.');
  const capacity = b.capacity ?? null;
  if (
    capacity !== null &&
    (!Number.isInteger(capacity) ||
      Number(capacity) < 1 ||
      Number(capacity) > 100000)
  )
    throw invalid('Capacidade inválida.');
  const eventType = choice(b.eventType, ['meetup', 'ride']);
  const routeId = b.routeId == null ? null : id(b.routeId),
    groupId = b.groupId == null ? null : id(b.groupId);
  const visibility = choice(b.visibility, ['public', 'group', 'invite']);
  if (
    (routeId && eventType !== 'ride') ||
    (visibility === 'group' && !groupId) ||
    (groupId && visibility !== 'group')
  )
    throw invalid(
      'Vínculo de rota ou grupo inválido. Eventos de grupo são exclusivos de membros.',
    );
  return {
    title: text(b.title, 120, true),
    description: text(b.description ?? '', 4000),
    rules: text(b.rules ?? '', 4000),
    eventType,
    visibility,
    joinPolicy: choice(b.joinPolicy, ['immediate', 'approval']),
    city: text(b.city, 100, true),
    state: choice(b.state, STATES),
    point: point(b.meetingPoint),
    label: text(b.meetingPointLabel, 200, true),
    reference: text(b.meetingReference ?? '', 500),
    startsAt,
    endsAt,
    timezone,
    capacity,
    groupId,
    routeId,
  };
}
