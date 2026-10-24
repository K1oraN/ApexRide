import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { AuthError } from '../auth/validation.js';
import { uuid } from '../rides/validation.js';
import { listQuery } from './validation.js';
import { registerRouteMutations } from './mutations.js';

export const selectRoute = (
  full = false,
) => `SELECT r.id,r.owner_id AS "ownerId",r.kind,r.name,r.description,r.city,r.state,r.category,r.status,r.verification,r.version,r.reason,
 r.distance_meters AS "distanceMeters",r.duration_seconds AS "durationSeconds",r.source,r.direction,r.updated_at AS "updatedAt",${full ? 'r.import_metadata' : 'NULL'} AS "importMetadata",
 public.ST_AsGeoJSON(${full ? 'r.geometry' : 'public.ST_SimplifyPreserveTopology(r.geometry,0.001)'})::json AS geometry,
 public.ST_AsGeoJSON(r.start_line)::json AS "startLine",
 (SELECT count(*)::int FROM route_favorites f WHERE f.route_id=r.id) AS favorites,
 EXISTS(SELECT 1 FROM route_favorites f WHERE f.route_id=r.id AND f.user_id=$1) AS favorite,
 ${full ? `(SELECT json_agg(json_build_array(public.ST_X(w.position),public.ST_Y(w.position)) ORDER BY w.point_order) FROM route_waypoints w WHERE w.route_id=r.id)` : 'NULL'} AS waypoints FROM routes r`;
export async function routeRoutes(
  app: FastifyInstance,
  options: { config: Config; pool?: Pool | undefined },
) {
  const db = () => {
    if (!options.pool) throw new AuthError(503, 'Percursos indisponíveis.');
    return options.pool;
  };
  const principal = createPrincipal(options.config, db);
  app.addHook('onRequest', sessionGuard(options.config));
  const viewer = async (req: FastifyRequest) => {
    if (!req.cookies.apex_session && !req.cookies['__Host-apex_session'])
      return null;
    try {
      return (await principal(req)).user.id;
    } catch (e) {
      if (e instanceof AuthError && e.statusCode === 401) return null;
      throw e;
    }
  };
  const id = (req: FastifyRequest) => {
    const id = (req.params as { id: string }).id;
    if (!uuid(id)) throw new AuthError(404, 'Percurso não encontrado.');
    return id;
  };
  registerRouteMutations(app, db, principal, id, options.config);
  async function list(
    req: FastifyRequest,
    scope = 'public',
    kind = '',
    nearby = false,
  ) {
    const user =
      scope === 'public' ? await viewer(req) : (await principal(req)).user.id;
    const q = listQuery(req.query as Record<string, unknown>, nearby);
    const values: unknown[] = [user];
    const param = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    };
    const where = [
      scope === 'mine'
        ? `r.owner_id=$1`
        : scope === 'favorites'
          ? `r.status='approved' AND EXISTS(SELECT 1 FROM route_favorites f WHERE f.route_id=r.id AND f.user_id=$1)`
          : `r.status='approved'`,
    ];
    if (kind || q.kind) where.push(`r.kind=${param(kind || q.kind)}`);
    if (q.q)
      where.push(
        `(to_tsvector('portuguese',r.name||' '||r.city||' '||r.state||' '||r.description) @@ plainto_tsquery('portuguese',${param(q.q)}) OR r.name ILIKE ${param('%' + q.q.replace(/[%_\\]/g, '\\$&') + '%')})`,
      );
    if (q.city) where.push(`lower(r.city)=lower(${param(q.city)})`);
    if (q.state) where.push(`r.state=${param(q.state.toUpperCase())}`);
    if (q.category) where.push(`lower(r.category)=lower(${param(q.category)})`);
    if (q.minDistance > q.maxDistance)
      throw new AuthError(400, 'Intervalo de distância inválido.');
    if (q.minDistance) where.push(`r.distance_meters>=${param(q.minDistance)}`);
    if (q.maxDistance < 5000000)
      where.push(`r.distance_meters<=${param(q.maxDistance)}`);
    let distance = '';
    if (q.center) {
      const p = `public.ST_SetSRID(public.ST_MakePoint(${param(q.center[0])},${param(q.center[1])}),4326)::public.geography`;
      where.push(
        `public.ST_DWithin(r.geometry::public.geography,${p},${param(q.radius)})`,
      );
      distance = `public.ST_Distance(r.geometry::public.geography,${p})`;
    }
    if (q.bbox)
      where.push(
        `r.geometry && public.ST_MakeEnvelope(${q.bbox.map(param).join(',')},4326)`,
      );
    const order =
      q.sort === 'nearest'
        ? distance
        : q.sort === 'favorites'
          ? 'favorites DESC'
          : q.sort === 'shortest'
            ? 'r.distance_meters'
            : q.sort === 'longest'
              ? 'r.distance_meters DESC'
              : 'r.created_at DESC';
    const rows = await db().query(
      `${selectRoute()} WHERE ${where.join(' AND ')} ORDER BY ${order},r.id LIMIT ${param(q.limit + 1)} OFFSET ${param((q.page - 1) * q.limit)}`,
      values,
    );
    return {
      status: 'ok',
      routes: rows.rows.slice(0, q.limit),
      page: q.page,
      hasMore: rows.rows.length > q.limit,
    };
  }
  app.get('/routes', (req) => list(req));
  app.get('/routes/nearby', (req) => list(req, 'public', '', true));
  app.get('/routes/mine', (req) => list(req, 'mine'));
  app.get('/routes/favorites', (req) => list(req, 'favorites'));
  app.get('/circuits', (req) => list(req, 'public', 'circuit'));
  for (const prefix of ['routes', 'circuits'])
    app.get(`/${prefix}/:id`, async (req) => {
      const user = await viewer(req);
      const row = (
        await db().query(
          `${selectRoute(true)} WHERE r.id=$2 AND (r.status='approved' OR r.owner_id=$1) ${prefix === 'circuits' ? "AND r.kind='circuit'" : ''}`,
          [user, id(req)],
        )
      ).rows[0];
      if (!row) throw new AuthError(404, 'Percurso não encontrado.');
      return { status: 'ok', route: row };
    });
}
