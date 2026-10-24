import type { Pool } from 'pg';
import { AuthError } from '../auth/validation.js';
import { digest } from '../auth/security.js';
import { BIKE_CATEGORIES, CC_BANDS } from '@apex-ride/ride-core/comparison';

export const publicConsent = `r.deleted_at IS NULL AND r.comparison_enabled AND r.visibility='public' AND ps.profile_visibility='public' AND u.account_status='active'`;
export const categoryJoin = `LEFT JOIN motorcycle_model_categories mc ON lower(mc.brand)=lower(r.motorcycle_snapshot->>'brand') AND lower(mc.model)=lower(r.motorcycle_snapshot->>'model')`;
export const categorySql = `COALESCE(r.motorcycle_snapshot->>'category',mc.category,'Não classificada')`;
export function comparisonConfig() {
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = process.env[key],
      n = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(n) || n < min || n > max)
      throw new Error(`${key} inválido.`);
    return n;
  };
  return {
    maxActivities: integer('COMPARISON_MAX_ACTIVITIES', 4, 2, 4),
    minParticipants: integer('COMPARISON_MIN_PARTICIPANTS', 10, 10, 1000),
  };
}
export function comparisonQuery(query: Record<string, unknown>) {
  const text = (key: string, max = 120) => {
    const v = query[key] ?? '';
    if (typeof v !== 'string' || v.length > max)
      throw new AuthError(400, 'Filtros inválidos.');
    return v;
  };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = query[key],
      n = raw === undefined ? fallback : Number(raw);
    if (
      (raw !== undefined && typeof raw !== 'string') ||
      !Number.isSafeInteger(n) ||
      n < min ||
      n > max
    )
      throw new AuthError(400, 'Filtros inválidos.');
    return n;
  };
  const allowed = [
    'page',
    'limit',
    'scope',
    'category',
    'ccBand',
    'brand',
    'model',
    'city',
    'state',
    'region',
  ];
  if (Object.keys(query).some((k) => !allowed.includes(k)))
    throw new AuthError(400, 'Filtro não permitido.');
  const category = text('category'),
    scope = text('scope') || 'own',
    ccBand = integer('ccBand', -1, -1, CC_BANDS.length - 1);
  if (
    (category && !BIKE_CATEGORIES.includes(category)) ||
    !['own', 'technical'].includes(scope)
  )
    throw new AuthError(400, 'Filtros inválidos.');
  return {
    page: integer('page', 1, 1, 1000),
    limit: integer('limit', 20, 1, 50),
    scope,
    category,
    ccBand,
    brand: text('brand'),
    model: text('model'),
    city: text('city'),
    state: text('state', 2),
    region: text('region', 20),
  };
}
const regions: Record<string, string[]> = {
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
export function matchesRegion(
  route: { city: string; state: string },
  q: ReturnType<typeof comparisonQuery>,
) {
  if (q.region && !regions[q.region])
    throw new AuthError(400, 'Região inválida.');
  return (
    (!q.city ||
      q.city.toLocaleLowerCase('pt-BR') ===
        route.city.toLocaleLowerCase('pt-BR')) &&
    (!q.state || q.state.toUpperCase() === route.state) &&
    (!q.region || regions[q.region]!.includes(route.state))
  );
}
export function bikeFilters(
  q: ReturnType<typeof comparisonQuery>,
  values: unknown[],
) {
  const where: string[] = [],
    param = (v: unknown) => {
      values.push(v);
      return '$' + values.length;
    };
  if (q.category) where.push(`${categorySql}=${param(q.category)}`);
  if (q.ccBand >= 0) {
    const band = CC_BANDS[q.ccBand]!;
    where.push(
      `(r.motorcycle_snapshot->>'displacementCc')::numeric BETWEEN ${param(band[0])} AND ${param(band[1])}`,
    );
  }
  for (const key of ['brand', 'model'] as const)
    if (q[key])
      where.push(
        `lower(r.motorcycle_snapshot->>'${key}')=lower(${param(q[key])})`,
      );
  return where.length ? ' AND ' + where.join(' AND ') : '';
}
export async function rateLimit(db: Pool, owner: string, expensive: boolean) {
  const result = await db.query(
    `INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END RETURNING attempts`,
    [digest('comparison:' + owner + ':' + expensive)],
  );
  if (result.rows[0].attempts > (expensive ? 12 : 60))
    throw new AuthError(
      429,
      'Limite de comparações atingido. Aguarde um minuto.',
    );
}
