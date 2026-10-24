import { AuthError } from '../auth/validation.js';
export const SOCIAL_LIMITS = {
  text: 2000,
  comment: 1000,
  photos: 5,
  photoBytes: 5 * 1024 * 1024,
  page: 20,
  maxPage: 50,
} as const;
export const unavailable = () =>
  new AuthError(404, 'Conteúdo indisponível ou removido.');
export function id(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new AuthError(400, 'Identificador inválido.');
  return value;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthError(400, 'Dados inválidos.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char),
    ) ||
    (required && !value.trim())
  )
    throw new AuthError(
      400,
      `Informe um texto válido de até ${max} caracteres.`,
    );
  return value.trim();
}
export function postInput(value: unknown) {
  const b = object(value);
  if (
    Object.keys(b).some(
      (k) =>
        ![
          'text',
          'visibility',
          'motorcycleId',
          'rideId',
          'mediaIds',
          'achievementCode',
        ].includes(k),
    )
  )
    throw new AuthError(400, 'Campo de publicação inválido.');
  if (!['public', 'followers', 'private'].includes(String(b.visibility)))
    throw new AuthError(400, 'Público inválido.');
  const media = b.mediaIds ?? [];
  if (!Array.isArray(media) || media.length > SOCIAL_LIMITS.photos)
    throw new AuthError(400, 'Use até cinco fotografias.');
  const mediaIds = media.map(id);
  if (new Set(mediaIds).size !== mediaIds.length)
    throw new AuthError(400, 'Fotografia duplicada.');
  const result = {
    text: text(b.text ?? '', SOCIAL_LIMITS.text),
    visibility: b.visibility as 'public' | 'followers' | 'private',
    motorcycleId: b.motorcycleId == null ? null : id(b.motorcycleId),
    rideId: b.rideId == null ? null : id(b.rideId),
    achievementCode:
      b.achievementCode == null ? null : text(b.achievementCode, 80, true),
    mediaIds,
  };
  if (
    !result.text &&
    !mediaIds.length &&
    !result.motorcycleId &&
    !result.rideId &&
    !result.achievementCode
  )
    throw new AuthError(400, 'Adicione texto, fotografia, moto ou Ride.');
  return result;
}
export function page(value: unknown) {
  const q = (value ?? {}) as Record<string, unknown>;
  const limit = q.limit === undefined ? SOCIAL_LIMITS.page : Number(q.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > SOCIAL_LIMITS.maxPage)
    throw new AuthError(400, 'Limite de página inválido.');
  let at: string | null = null,
    key: string | null = null;
  if (q.cursor !== undefined) {
    try {
      if (typeof q.cursor !== 'string' || q.cursor.length > 300)
        throw new Error();
      const cursor = JSON.parse(
        Buffer.from(q.cursor, 'base64url').toString('utf8'),
      );
      key = id(cursor.id);
      if (
        typeof cursor.at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(cursor.at) ||
        !Number.isFinite(Date.parse(cursor.at)) ||
        new Date(cursor.at).toISOString().slice(0, 19) !==
          cursor.at.slice(0, 19)
      )
        throw new Error();
      at = cursor.at;
    } catch {
      throw new AuthError(400, 'Cursor inválido. Atualize a listagem.');
    }
  }
  return { limit, at, key };
}
export function paginated<
  T extends { id: string; created_at: Date; cursor_at?: string },
>(rows: T[], limit: number) {
  const items = rows.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              at: last.cursor_at ?? last.created_at.toISOString(),
              id: last.id,
            }),
          ).toString('base64url')
        : null,
  };
}
