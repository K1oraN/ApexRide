import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { AuthError } from '../auth/validation.js';
import { uuid } from '../rides/validation.js';
import {
  bikeFilters,
  categoryJoin,
  comparisonQuery,
  matchesRegion,
  rateLimit,
} from '../comparisons/policy.js';
import { compareActivities } from '../comparisons/service.js';
import { source, ownMatch } from './repository.js';
import { RULES, planFor } from './geometry.js';
import { personalGroups, type Match } from './engine.js';
import { communityDiscovery } from './community.js';

export async function similarityRoutes(
  app: FastifyInstance,
  options: { config: Config; pool?: Pool | undefined },
) {
  const db = () => {
      if (!options.pool) throw new AuthError(503, 'Análise indisponível.');
      return options.pool;
    },
    principal = createPrincipal(options.config, db);
  app.addHook('onRequest', sessionGuard(options.config));
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Vary', 'Cookie');
    reply.header('X-Robots-Tag', 'noindex, noarchive');
    const { user } = await principal(req, req.method !== 'GET');
    await rateLimit(db(), user.id, req.method !== 'GET');
  });
  const idOf = (params: unknown) => {
    const id = (params as { id: string }).id;
    if (!uuid(id)) throw new AuthError(404, 'Atividade não encontrada.');
    return id;
  };
  app.get('/rides/:id/similarity-status', async (req) => {
    const { user } = await principal(req),
      id = idOf(req.params);
    await source(db(), id, user.id);
    const row = (
      await db().query(
        `SELECT status,version,quality->>'reason' AS reason,indexed_at AS "indexedAt",candidate_count AS "candidateCount",truncated FROM ride_similarity_index WHERE ride_id=$1`,
        [id],
      )
    ).rows[0];
    return row ?? { status: 'queued', version: RULES.version };
  });
  app.post(
    '/rides/:id/similarity/reprocess',
    { bodyLimit: 128 },
    async (req) => {
      if (Object.keys((req.body ?? {}) as object).length)
        throw new AuthError(400, 'Consulta inválida.');
      const { user } = await principal(req, true),
        id = idOf(req.params);
      await source(db(), id, user.id);
      const row = await db().query(
        `UPDATE ride_similarity_index SET status='queued',attempts=0,next_attempt=now(),lease_until=NULL,geometry=NULL,quality='{}' WHERE ride_id=$1 AND status<>'processing' AND (indexed_at IS NULL OR indexed_at<now()-interval '1 minute') RETURNING ride_id`,
        [id],
      );
      if (!row.rowCount)
        throw new AuthError(
          409,
          'Análise em andamento ou solicitada recentemente. Aguarde um minuto.',
        );
      await db().query(
        'DELETE FROM ride_similarity_matches WHERE a=$1 OR b=$1',
        [id],
      );
      return { status: 'queued' };
    },
  );
  app.get('/rides/:id/similar', async (req) => {
    const { user } = await principal(req),
      id = idOf(req.params);
    await source(db(), id, user.id);
    const q = comparisonQuery(req.query as Record<string, unknown>);
    if (q.scope !== 'own')
      throw new AuthError(400, 'Somente atividades próprias.');
    matchesRegion({ city: '', state: '' }, q);
    const values: unknown[] = [id, user.id, RULES.version],
      filters = bikeFilters(q, values);
    // Region metadata is attached only through trusted polygons, never residence.
    const regionRows = (
      await db().query<{ city: string; state: string }>(
        'SELECT city,state FROM similarity_regions',
      )
    ).rows;
    const regionIds =
      q.city || q.state || q.region
        ? regionRows.filter((r) => matchesRegion(r, q))
        : null;
    const regions = regionIds
      ? regionIds.map((r) => r.city + '|' + r.state)
      : null;
    values.push(regions, q.limit + 1, (q.page - 1) * q.limit);
    const rows = (
      await db().query<{
        id: string;
        title: string;
        result: Match;
        a: string;
        city: string | null;
        state: string | null;
      }>(
        `SELECT r.id,r.title,m.a,m.result,rg.city,rg.state,r.motorcycle_snapshot AS bike FROM ride_similarity_matches m JOIN ride_similarity_index ia ON ia.ride_id=m.a AND ia.status='done' AND ia.version=m.version JOIN ride_similarity_index ib ON ib.ride_id=m.b AND ib.status='done' AND ib.version=m.version JOIN rides anchor ON anchor.id=$1 JOIN rides r ON r.id=CASE WHEN m.a=$1 THEN m.b ELSE m.a END JOIN ride_similarity_index si ON si.ride_id=r.id LEFT JOIN similarity_regions rg ON rg.id=si.region_id ${categoryJoin} WHERE (m.a=$1 OR m.b=$1) AND m.version=$3 AND anchor.owner_id=$2 AND anchor.deleted_at IS NULL AND r.owner_id=$2 AND r.deleted_at IS NULL ${filters} AND ($${values.length - 2}::text[] IS NULL OR rg.city||'|'||rg.state=ANY($${values.length - 2}::text[])) ORDER BY m.calculated_at DESC,r.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      )
    ).rows;
    return {
      matches: rows.slice(0, q.limit).map((r) => ({
        id: r.id,
        title: r.title,
        city: r.city,
        state: r.state,
        ...r.result,
        coverageA: r.a === id ? r.result.coverageA : r.result.coverageB,
        coverageB: r.a === id ? r.result.coverageB : r.result.coverageA,
      })),
      page: q.page,
      hasMore: rows.length > q.limit,
    };
  });
  app.get('/rides/similar-groups', async (req) => {
    const { user } = await principal(req),
      q = comparisonQuery(req.query as Record<string, unknown>);
    if (
      Object.keys(req.query as object).some(
        (k) => !['page', 'limit'].includes(k),
      )
    )
      throw new AuthError(400, 'Filtro não permitido.');
    const rows = (
      await db().query<{ a: string; b: string; classification: string }>(
        `SELECT m.a,m.b,m.result->>'classification' AS classification FROM ride_similarity_matches m JOIN ride_similarity_index ia ON ia.ride_id=m.a AND ia.status='done' AND ia.version=m.version JOIN ride_similarity_index ib ON ib.ride_id=m.b AND ib.status='done' AND ib.version=m.version JOIN rides a ON a.id=m.a JOIN rides b ON b.id=m.b WHERE a.owner_id=$1 AND b.owner_id=$1 AND a.deleted_at IS NULL AND b.deleted_at IS NULL AND m.version=$2 AND m.result->>'classification'='full' ORDER BY m.a,m.b LIMIT 1001`,
        [user.id, RULES.version],
      )
    ).rows;
    const groups = personalGroups(rows.slice(0, 1000)),
      offset = (q.page - 1) * q.limit;
    return {
      groups: groups.slice(offset, offset + q.limit),
      page: q.page,
      hasMore: groups.length > offset + q.limit,
      truncated: rows.length > 1000,
    };
  });
  app.post('/rides/:id/similar/compare', { bodyLimit: 256 }, async (req) => {
    const { user } = await principal(req, true),
      id = idOf(req.params),
      b = req.body as { activityId?: unknown };
    if (
      !b ||
      Object.keys(b).some((k) => k !== 'activityId') ||
      !uuid(b.activityId) ||
      b.activityId === id
    )
      throw new AuthError(400, 'Selecione duas atividades distintas.');
    const match = await ownMatch(db(), id, b.activityId, user.id),
      r = match.result;
    if (
      r.direction !== 'same' ||
      !['full', 'partial', 'limited'].includes(r.classification) ||
      !r.pieces.length
    )
      throw new AuthError(
        422,
        'Sentido ou qualidade incompatível com comparação orientada.',
      );
    const plan = planFor(r.pieces[0]!.geometry);
    const result = await compareActivities(
      db(),
      {
        id,
        name: 'Trechos GPS comuns',
        owner_id: user.id,
        kind: 'route',
        status: 'private',
        verification: 'suggested',
        city: 'Região do trajeto',
        state: '',
        version: 1,
        plan,
      },
      [match.a, match.b],
      user.id,
      undefined,
      {
        version: r.version,
        classification: r.classification,
        plan,
        pieces: r.pieces,
        windows: {
          [match.a]: r.pieces.map((p) => p.a),
          [match.b]: r.pieces.map((p) => p.b),
        },
      },
    );
    // Reject a revoked/reprocessed/deleted reference while metrics were built.
    const fresh = await ownMatch(db(), id, b.activityId, user.id);
    if (JSON.stringify(fresh.result) !== JSON.stringify(r))
      throw new AuthError(409, 'A referência mudou. Refaça a comparação.');
    return result;
  });
  app.get('/similarity/community', async (req) =>
    communityDiscovery(db(), req.query as Record<string, unknown>),
  );
  app.get('/similarity/regions', async () => ({
    regions: (
      await db().query(
        "SELECT id,city,state FROM similarity_regions ORDER BY (state='AL') DESC,state,city LIMIT 500",
      )
    ).rows,
  }));
}
