import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { createPrincipal } from '../auth/session.js';
import { historyFields, historyQuery } from './history-query.js';
import { historyTrack, historyTelemetry, ownRide } from './history-data.js';
import { uuid } from './validation.js';
import { AuthError } from '../auth/validation.js';
import { historyStats } from './history-stats.js';
import { replayData } from './replay.js';
export function registerHistory(
  app: FastifyInstance,
  db: () => Pool,
  principal: ReturnType<typeof createPrincipal>,
) {
  const id = (params: unknown) => {
    const id = (params as { id: string }).id;
    if (!uuid(id)) throw new AuthError(404, 'Atividade não encontrada.');
    return id;
  };
  const bounded = (raw: unknown, fallback: number, max: number) => {
    const n = raw === undefined ? fallback : Number(raw);
    if (typeof raw === 'object' || !Number.isSafeInteger(n) || n < 1 || n > max)
      throw new AuthError(400, 'Limite inválido.');
    return n;
  };
  const reads = new Map<string, { at: number; count: number }>();
  const cleanup = setInterval(() => {
    for (const [key, v] of reads)
      if (v.at < Date.now() - 60000) reads.delete(key);
  }, 60000);
  cleanup.unref();
  app.addHook('onClose', async () => clearInterval(cleanup));
  app.addHook('preHandler', async (request) => {
    if (
      request.method !== 'GET' ||
      !/^\/api\/rides(?:\?|\/|$)/.test(request.url)
    )
      return;
    const { user } = await principal(request);
    const heavy = /\/(telemetry|track)(?:\?|$)/.test(request.url);
    const key = user.id + (heavy ? ':series' : ':read'),
      now = Date.now();
    let value = reads.get(key);
    if (!value || value.at < now - 60000) {
      value = { at: now, count: 0 };
      reads.set(key, value);
    }
    if (++value.count > (heavy ? 24 : 240))
      throw new AuthError(
        429,
        'Limite de consultas atingido. Aguarde um minuto.',
      );
  });
  app.patch('/rides/:id', async (req) => {
    const { user } = await principal(req, true),
      rideId = id(req.params);
    const body = req.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !Object.keys(body).length ||
      Object.keys(body).some(
        (k) => !['title', 'description', 'visibility'].includes(k),
      )
    )
      throw new AuthError(
        400,
        'Edite somente título, descrição e visibilidade.',
      );
    const b = body as {
      title?: unknown;
      description?: unknown;
      visibility?: unknown;
    };
    if (
      (b.title !== undefined &&
        (typeof b.title !== 'string' || b.title.length > 120)) ||
      (b.description !== undefined &&
        (typeof b.description !== 'string' || b.description.length > 4000)) ||
      (b.visibility !== undefined &&
        !['public', 'private'].includes(b.visibility as string))
    )
      throw new AuthError(400, 'Metadados inválidos.');
    const result = await db().query(
      `UPDATE rides SET title=COALESCE($3,title),description=COALESCE($4,description),visibility=COALESCE($5,visibility),updated_at=now() WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL RETURNING id`,
      [
        rideId,
        user.id,
        typeof b.title === 'string' ? b.title.trim() : null,
        typeof b.description === 'string' ? b.description.trim() : null,
        b.visibility ?? null,
      ],
    );
    if (!result.rowCount) throw new AuthError(404, 'Atividade não encontrada.');
    return { status: 'ok' };
  });
  app.delete('/rides/:id', async (req) => {
    const { user } = await principal(req, true),
      rideId = id(req.params);
    const c = await db().connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      const result = await c.query(
        'UPDATE rides SET deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id,client_id',
        [rideId, user.id],
      );
      if (!result.rowCount)
        throw new AuthError(404, 'Atividade não encontrada.');
      await c.query(
        'INSERT INTO ride_deletions(owner_id,client_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [user.id, result.rows[0].client_id],
      );
      await reconcileUser(c, user.id);
      await c.query('COMMIT');
      return { status: 'ok' };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  });
  app.delete('/rides/by-client/:clientId', async (req) => {
    const { user } = await principal(req, true),
      clientId = (req.params as { clientId: string }).clientId;
    if (!uuid(clientId))
      throw new AuthError(400, 'Identificador de sessão inválido.');
    const c = await db().connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      await c.query(
        'INSERT INTO ride_deletions(owner_id,client_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [user.id, clientId],
      );
      await c.query(
        'UPDATE rides SET deleted_at=COALESCE(deleted_at,now()),updated_at=now() WHERE owner_id=$1 AND client_id=$2',
        [user.id, clientId],
      );
      await c.query(
        'DELETE FROM ride_uploads WHERE owner_id=$1 AND client_id=$2',
        [user.id, clientId],
      );
      await reconcileUser(c, user.id);
      await c.query('COMMIT');
      return { status: 'ok' };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  });
  app.get('/rides/receipts', async (req) => {
    const { user } = await principal(req);
    const raw = (req.query as { ids?: unknown }).ids;
    if (typeof raw !== 'string' || raw.length > 3700)
      throw new AuthError(400, 'Identificadores inválidos.');
    const ids = raw.split(',');
    if (ids.length > 100 || !ids.every(uuid))
      throw new AuthError(400, 'Informe até 100 identificadores válidos.');
    const rows = await db().query(
      `SELECT client_id AS "clientId",id,deleted_at IS NOT NULL AS deleted FROM rides WHERE owner_id=$1 AND client_id=ANY($2::uuid[]) UNION ALL SELECT d.client_id AS "clientId",NULL::uuid AS id,true AS deleted FROM ride_deletions d WHERE d.owner_id=$1 AND d.client_id=ANY($2::uuid[]) AND NOT EXISTS(SELECT 1 FROM rides r WHERE r.owner_id=d.owner_id AND r.client_id=d.client_id)`,
      [user.id, ids],
    );
    return { status: 'ok', receipts: rows.rows };
  });
  app.get('/rides/stats', async (req) => {
    const { user } = await principal(req);
    return historyStats(db(), req.query as Record<string, unknown>, user.id);
  });
  app.get('/rides/:id/track', async (req) => {
    const { user } = await principal(req);
    const q = req.query as { limit?: unknown };
    return historyTrack(
      db(),
      id(req.params),
      user.id,
      bounded(q.limit, 1000, 2000),
    );
  });
  app.get('/rides/:id/telemetry', async (req) => {
    const { user } = await principal(req);
    return historyTelemetry(db(), id(req.params), user.id);
  });
  app.get('/rides/:id/replay', async (req, reply) => {
    const { user } = await principal(req);
    reply.header('Cache-Control', 'private, no-store');
    return replayData(
      db(),
      id(req.params),
      user.id,
      req.query as Record<string, unknown>,
    );
  });
  for (const kind of ['events', 'laps'])
    app.get(`/rides/:id/${kind}`, async (req) => {
      const { user } = await principal(req),
        rideId = id(req.params);
      await ownRide(db(), rideId, user.id);
      const q = req.query as { page?: unknown; limit?: unknown };
      const page = bounded(q.page, 1, 1000),
        limit = bounded(q.limit, 50, 100);
      const fields =
        kind === 'events'
          ? `id,type,start_ms::float8 AS "startMs",end_ms::float8 AS "endMs",duration_ms::float8 AS "durationMs",status,reason,method,version,quality,force`
          : `lap_number AS number,extract(epoch FROM started_at)*1000::float8 AS start,extract(epoch FROM ended_at)*1000::float8 AS end,duration_ms::float8 AS "durationMs",status,quality`;
      const table = kind === 'events' ? 'ride_performance_events' : 'ride_laps',
        order = kind === 'events' ? 'start_ms,id' : 'lap_number';
      const rows = (
        await db().query(
          `SELECT ${fields} FROM ${table} WHERE ride_id=$1 ORDER BY ${order} LIMIT $2 OFFSET $3`,
          [rideId, limit + 1, (page - 1) * limit],
        )
      ).rows;
      return {
        status: 'ok',
        items: rows.slice(0, limit),
        page,
        hasMore: rows.length > limit,
      };
    });
  app.get('/rides', async (request) => {
    const { user } = await principal(request);
    const q = historyQuery(request.query as Record<string, unknown>, user.id);
    const values = [...q.values, q.limit + 1, q.offset];
    const [rows, count] = await Promise.all([
      db().query(
        `SELECT ${historyFields} FROM rides r WHERE ${q.where} ORDER BY ${q.order},r.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db().query(
        `SELECT count(*)::int AS total FROM rides r WHERE ${q.where}`,
        q.values,
      ),
    ]);
    return {
      status: 'ok',
      rides: rows.rows.slice(0, q.limit),
      total: count.rows[0].total,
      hasMore: rows.rows.length > q.limit,
      offset: q.offset,
      limit: q.limit,
      page: q.page,
    };
  });
  app.get('/rides/filters', async (request) => {
    const { user } = await principal(request);
    const [bikes, routes] = await Promise.all([
      db().query(
        `SELECT DISTINCT ON (motorcycle_id) motorcycle_id AS id,motorcycle_snapshot AS motorcycle FROM rides WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY motorcycle_id,started_at DESC`,
        [user.id],
      ),
      db().query(
        `SELECT DISTINCT ON (route_id) route_id AS id,route_snapshot->>'name' AS name FROM rides WHERE owner_id=$1 AND deleted_at IS NULL AND route_id IS NOT NULL ORDER BY route_id,started_at DESC`,
        [user.id],
      ),
    ]);
    return { status: 'ok', motorcycles: bikes.rows, routes: routes.rows };
  });
}
import { reconcileUser } from '../gamification/engine.js';
