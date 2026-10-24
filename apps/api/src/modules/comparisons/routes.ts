import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { AuthError } from '../auth/validation.js';
import { uuid } from '../rides/validation.js';
import {
  comparisonConfig,
  comparisonQuery,
  matchesRegion,
  bikeFilters,
  categorySql,
  categoryJoin,
  publicConsent,
  rateLimit,
} from './policy.js';
import { comparisonRoute, compareActivities } from './service.js';
import { BIKE_CATEGORIES, CC_BANDS } from '@apex-ride/ride-core/comparison';

export async function comparisonRoutes(
  app: FastifyInstance,
  options: { config: Config; pool?: Pool | undefined },
) {
  const config = comparisonConfig(),
    db = () => {
      if (!options.pool) throw new AuthError(503, 'Comparações indisponíveis.');
      return options.pool;
    },
    principal = createPrincipal(options.config, db);
  app.addHook('onRequest', sessionGuard(options.config));
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Vary', 'Cookie');
    reply.header('X-Robots-Tag', 'noindex, noarchive');
    const { user } = await principal(req, req.method !== 'GET');
    await rateLimit(db(), user.id, req.method === 'POST');
  });
  const identifier = (params: unknown) => {
    const id = (params as { id: string }).id;
    if (!uuid(id)) throw new AuthError(404, 'Recurso não encontrado.');
    return id;
  };
  app.get('/routes/:id/comparison-candidates', async (req) => {
    const { user } = await principal(req),
      route = await comparisonRoute(db(), identifier(req.params), user.id),
      q = comparisonQuery(req.query as Record<string, unknown>);
    const values: unknown[] = [route.id, user.id],
      filters = bikeFilters(q, values),
      region = matchesRegion(route, q);
    const technical = q.scope === 'technical';
    const access = technical
      ? `r.owner_id<>$2 AND ${publicConsent} AND r.comparison_technical AND r.mode='pista' AND ${route.kind === 'circuit' && route.verification === 'verified' && route.status === 'approved' ? 'true' : 'false'}`
      : 'r.owner_id=$2 AND r.deleted_at IS NULL';
    values.push(q.limit + 1, (q.page - 1) * q.limit);
    const rows = region
      ? (
          await db().query(
            `SELECT r.id,r.mode,r.motorcycle_snapshot AS bike,${categorySql} AS category,r.route_version AS "routeVersion",r.route_result->>'completion' AS completion,r.distance_meters AS "distanceMeters",r.active_ms::float8 AS "activeMs",r.owner_id=$2 AS own,CASE WHEN r.owner_id=$2 THEN to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') ELSE NULL END AS day,EXISTS(SELECT 1 FROM ride_motion m WHERE m.ride_id=r.id AND (m.calibration->>'valid')::boolean) AS sensors,(SELECT count(*)::int FROM ride_points p WHERE p.ride_id=r.id) AS "pointCount",r.comparison_enabled AS "comparisonEnabled",r.comparison_technical AS "comparisonTechnical" FROM rides r JOIN users u ON u.id=r.owner_id JOIN privacy_settings ps ON ps.user_id=r.owner_id ${categoryJoin} WHERE r.route_id=$1 AND (${access}) ${filters} ORDER BY r.started_at DESC,r.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
          )
        ).rows
      : [];
    return {
      candidates: rows.slice(0, q.limit),
      page: q.page,
      hasMore: rows.length > q.limit,
      maxActivities: config.maxActivities,
      minParticipants: config.minParticipants,
      route: {
        id: route.id,
        name: route.name,
        city: route.city,
        state: route.state,
        plan: route.plan,
      },
      categories: BIKE_CATEGORIES,
      ccBands: CC_BANDS,
      technicalAvailable:
        route.kind === 'circuit' &&
        route.verification === 'verified' &&
        route.status === 'approved',
    };
  });
  const selections = (body: unknown) => {
    const b = body as { activityIds?: unknown };
    const ids = b?.activityIds;
    if (
      !Array.isArray(ids) ||
      ids.length < 2 ||
      ids.length > config.maxActivities ||
      !ids.every(uuid) ||
      new Set(ids).size !== ids.length
    )
      throw new AuthError(
        400,
        `Selecione de 2 a ${config.maxActivities} atividades distintas.`,
      );
    return ids as string[];
  };
  app.post('/routes/:id/compare', { bodyLimit: 2048 }, async (req) => {
    if (
      Object.keys((req.body ?? {}) as object).some((k) => k !== 'activityIds')
    )
      throw new AuthError(400, 'Consulta inválida.');
    const ids = selections(req.body),
      { user } = await principal(req, true),
      route = await comparisonRoute(db(), identifier(req.params), user.id);
    return compareActivities(db(), route, ids, user.id);
  });
  app.patch(
    '/rides/:id/comparison-privacy',
    { bodyLimit: 1024 },
    async (req) => {
      const { user } = await principal(req, true),
        id = identifier(req.params),
        b = req.body as { enabled?: unknown; technical?: unknown };
      if (
        !b ||
        Object.keys(b).some((k) => !['enabled', 'technical'].includes(k)) ||
        typeof b.enabled !== 'boolean' ||
        typeof b.technical !== 'boolean' ||
        (b.technical && !b.enabled)
      )
        throw new AuthError(400, 'Permissão inválida.');
      // Revocation always works, including archived routes and private profiles.
      const result = await db().query(
        `UPDATE rides r SET comparison_enabled=$3,comparison_technical=$4,comparison_revision=comparison_revision+1,updated_at=now() WHERE r.id=$1 AND r.owner_id=$2 AND r.deleted_at IS NULL AND ($3=false OR (r.visibility='public' AND EXISTS(SELECT 1 FROM privacy_settings ps WHERE ps.user_id=r.owner_id AND ps.profile_visibility='public') AND ($4=false OR EXISTS(SELECT 1 FROM routes rt WHERE rt.id=r.route_id AND rt.status='approved' AND rt.kind='circuit' AND rt.verification='verified' AND r.mode='pista' AND rt.version=r.route_version)) AND EXISTS(SELECT 1 FROM ride_points p WHERE p.ride_id=r.id OFFSET 2))) RETURNING comparison_enabled AS enabled,comparison_technical AS technical`,
        [id, user.id, b.enabled, b.technical],
      );
      if (!result.rows[0])
        throw new AuthError(
          404,
          'Atividade indisponível ou inelegível. Verifique perfil público e dados GPS; telemetria técnica exige circuito verificado.',
        );
      return { status: 'ok', ...result.rows[0] };
    },
  );
  app.get('/routes/:id/comparison-stats', async (req) => {
    const { user } = await principal(req),
      route = await comparisonRoute(db(), identifier(req.params), user.id),
      q = comparisonQuery(req.query as Record<string, unknown>);
    // Only disjoint category × displacement cells are released. No grand total,
    // brand/model/date subsets or overlapping ranges enabling differencing.
    if (q.brand || q.model || q.scope !== 'own')
      throw new AuthError(
        400,
        'Agregados usam somente categoria e faixa de cilindrada fixas.',
      );
    if (!q.category || q.ccBand < 0)
      return {
        available: false,
        message:
          'Escolha categoria e faixa de cilindrada para a comparação comunitária.',
        minParticipants: config.minParticipants,
      };
    if (!matchesRegion(route, q) || route.status !== 'approved')
      return {
        available: false,
        message: 'Dados insuficientes para comparação comunitária.',
      };
    const values: unknown[] = [
        route.id,
        JSON.stringify(route.plan?.geometry ?? null),
        JSON.stringify(route.plan?.direction ?? null),
      ],
      filters = bikeFilters(q, values);
    values.push(config.minParticipants);
    // One contribution per distinct account. Coarse buckets, no IDs/counts/times.
    const row = (
      await db().query(
        `WITH per_owner AS (SELECT r.owner_id,avg(r.distance_meters) AS distance,avg(r.active_ms) AS duration,avg(CASE WHEN r.route_result->>'completion'='completed' THEN 1.0 ELSE 0.0 END) AS completion,count(*) AS frequency FROM rides r JOIN users u ON u.id=r.owner_id JOIN privacy_settings ps ON ps.user_id=r.owner_id ${categoryJoin} WHERE r.route_id=$1 AND r.route_snapshot->'geometry'=$2::jsonb AND COALESCE(r.route_snapshot->'direction','null'::jsonb)=$3::jsonb AND r.route_result->>'completion' IN ('completed','partial') AND ${publicConsent} ${filters} GROUP BY r.owner_id) SELECT round((avg(distance)/1000)::numeric)::float8 AS "distanceKm",(round((avg(duration)/300000)::numeric)*5)::float8 AS "activeMinutes",(round((avg(completion)*10)::numeric)*10)::float8 AS "completionPercent",round(avg(frequency)::numeric)::int AS "activitiesPerParticipant" FROM per_owner HAVING count(*) >= $${values.length}`,
        values,
      )
    ).rows[0];
    return row
      ? {
          available: true,
          cohort: { category: q.category, ccBand: q.ccBand },
          summary: row,
          minParticipants: config.minParticipants,
          policy: 'disjoint-cohorts-v1',
        }
      : {
          available: false,
          message: 'Dados insuficientes para comparação comunitária.',
          minParticipants: config.minParticipants,
        };
  });
  app.post('/circuits/:id/compare-laps', { bodyLimit: 2048 }, async (req) => {
    const { user } = await principal(req, true),
      route = await comparisonRoute(db(), identifier(req.params), user.id),
      b = req.body as { activityIds?: unknown; lapNumbers?: unknown };
    if (
      route.kind !== 'circuit' ||
      route.verification !== 'verified' ||
      route.status !== 'approved'
    )
      throw new AuthError(
        422,
        'Comparação de voltas exige circuito fechado verificado.',
      );
    const ids = selections(b),
      laps = b.lapNumbers;
    if (
      Object.keys(b).some((k) => !['activityIds', 'lapNumbers'].includes(k)) ||
      !Array.isArray(laps) ||
      laps.length !== ids.length ||
      !laps.every((n) => Number.isSafeInteger(n) && n > 0 && n <= 500)
    )
      throw new AuthError(400, 'Selecione uma volta válida de cada atividade.');
    return compareActivities(db(), route, ids, user.id, laps as number[]);
  });
}
