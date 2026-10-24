import { AuthError } from '../auth/validation.js';
import { uuid } from './validation.js';
const invalid = () => new AuthError(400, 'Filtros do histórico inválidos.');
export function historyQuery(query: Record<string, unknown>, owner: string) {
  const string = (key: string, max = 120) => {
    const v = query[key] ?? '';
    if (typeof v !== 'string' || v.length > max) throw invalid();
    return v;
  };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = query[key];
    const n = raw === undefined ? fallback : Number(raw);
    if (
      typeof raw === 'object' ||
      !Number.isSafeInteger(n) ||
      n < min ||
      n > max
    )
      throw invalid();
    return n;
  };
  const limit = integer('limit', 50, 1, 50),
    page = integer('page', 1, 1, 20000),
    offset = integer('offset', (page - 1) * limit, 0, 1000000);
  const mode = string('mode'),
    bike = string('motorcycleId'),
    route = string('routeId'),
    visibility = string('visibility'),
    sort = string('sort') || 'recent',
    q = string('q');
  if (
    (mode && !['passeio', 'pista', 'misto'].includes(mode)) ||
    (visibility && !['public', 'private'].includes(visibility)) ||
    (bike && !uuid(bike)) ||
    (route && route !== 'none' && !uuid(route)) ||
    !['recent', 'oldest', 'distance', 'duration'].includes(sort)
  )
    throw invalid();
  const values: unknown[] = [owner],
    where = ['r.owner_id=$1', 'r.deleted_at IS NULL'];
  const param = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (mode) where.push(`r.mode=${param(mode)}`);
  if (bike) where.push(`r.motorcycle_id=${param(bike)}`);
  if (route)
    where.push(
      route === 'none' ? 'r.route_id IS NULL' : `r.route_id=${param(route)}`,
    );
  if (visibility) where.push(`r.visibility=${param(visibility)}`);
  for (const key of ['from', 'to'] as const) {
    const date = string(key, 40);
    if (date) {
      if (
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date.slice(0, 10)
      )
        throw invalid();
      where.push(
        `r.started_at ${key === 'from' ? '>=' : '<'} ${param(date)}::timestamptz`,
      );
    }
  }
  if (
    query.from &&
    query.to &&
    Date.parse(String(query.from)) >= Date.parse(String(query.to))
  )
    throw invalid();
  if (q) {
    const term = param(q);
    const like = '%' + q.replace(/[%_\\]/g, '\\$&') + '%';
    const p = param(like);
    where.push(
      `(to_tsvector('portuguese',r.title||' '||r.description) @@ plainto_tsquery('portuguese',${term}) OR COALESCE(NULLIF(r.title,''),initcap(r.mode)||' — '||to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY')) ILIKE ${p} OR r.description ILIKE ${p} OR concat(r.motorcycle_snapshot->>'brand',' ',r.motorcycle_snapshot->>'model') ILIKE ${p} OR r.route_snapshot->>'name' ILIKE ${p})`,
    );
  }
  return {
    values,
    where: where.join(' AND '),
    order: {
      recent: 'r.started_at DESC',
      oldest: 'r.started_at',
      distance: 'r.distance_meters DESC',
      duration: 'r.active_ms DESC',
    }[sort]!,
    offset,
    limit,
    page,
  };
}
export const historyFields = `r.id,r.client_id,r.motorcycle_id,r.mode,r.visibility,r.started_at,r.ended_at,r.active_ms::float8 AS active_ms,r.paused_ms::float8 AS paused_ms,r.distance_meters,r.average_kmh,r.maximum_kmh,r.completion_state,r.created_at,r.updated_at,
 COALESCE(NULLIF(r.title,''),initcap(r.mode)||' — '||to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY')) AS title,r.description,r.motorcycle_snapshot,
 r.route_id,r.route_snapshot->>'name' AS route_name,r.route_result->>'completion' AS route_completion`;
