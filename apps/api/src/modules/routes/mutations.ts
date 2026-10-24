import {
  adminPrincipal,
  audit as adminAudit,
  revalidate,
} from '../admin/policy.js';
import { text as adminText } from '../admin/validation.js';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Config } from '../../config/env.js';
import type { createPrincipal } from '../auth/session.js';
import { AuthError } from '../auth/validation.js';
import { invalid, routeData } from './validation.js';
import { selectRoute } from './routes.js';
import { calculateRoute } from './routing.js';
export function registerRouteMutations(
  app: FastifyInstance,
  db: () => Pool,
  principal: ReturnType<typeof createPrincipal>,
  id: (r: FastifyRequest) => string,
  config: Config,
) {
  async function tx<T>(action: (c: PoolClient) => Promise<T>) {
    const c = await db().connect();
    try {
      await c.query('BEGIN');
      const r = await action(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  const admin = adminPrincipal(config, db);
  async function moderator(req: FastifyRequest, modify = false) {
    return admin(req, 'admin.routes.review', modify);
  }
  const rate = new Map<string, number[]>();
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [key, times] of rate)
      if (!times.some((t) => t > cutoff)) rate.delete(key);
  }, 60000);
  cleanup.unref();
  app.addHook('onClose', async () => clearInterval(cleanup));
  let inFlight = 0;
  app.post('/routes/calculate', async (req) => {
    const { user } = await principal(req, true);
    const now = Date.now();
    const times = (rate.get(user.id) ?? []).filter((t) => t > now - 60000);
    if (times.length >= 6 || inFlight >= 4)
      throw new AuthError(
        429,
        'Limite de cálculo atingido. Aguarde um minuto.',
      );
    times.push(now);
    rate.set(user.id, times);
    inFlight++;
    try {
      return {
        status: 'ok',
        ...(await calculateRoute(
          config.routing,
          (req.body as { waypoints?: unknown })?.waypoints,
        )),
      };
    } finally {
      inFlight--;
    }
  });
  for (const prefix of ['routes', 'circuits']) {
    app.post(`/${prefix}`, { bodyLimit: 1_000_000 }, async (req, reply) => {
      const { user } = await principal(req, true);
      const b = routeData(req.body, prefix === 'circuits');
      const routeId = randomUUID();
      const row = await tx(async (c) => {
        await c.query(
          `INSERT INTO routes(id,owner_id,kind,name,description,city,state,category,geometry,distance_meters,duration_seconds,source,start_line,direction)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,public.ST_SetSRID(public.ST_GeomFromGeoJSON($9),4326),public.ST_Length(public.ST_SetSRID(public.ST_GeomFromGeoJSON($9),4326)::public.geography),$10,$11,public.ST_SetSRID(public.ST_GeomFromGeoJSON($12),4326),$13)`,
          [
            routeId,
            user.id,
            prefix === 'circuits' ? 'circuit' : 'route',
            b.name,
            b.description,
            b.city,
            b.state,
            b.category,
            JSON.stringify(b.geometry),
            b.durationSeconds,
            b.source,
            b.startLine ? JSON.stringify(b.startLine) : null,
            b.direction,
          ],
        );
        await waypoints(c, routeId, b.waypoints);
        return (
          await c.query(`${selectRoute(true)} WHERE r.id=$2`, [
            user.id,
            routeId,
          ])
        ).rows[0];
      });
      return reply.code(201).send({ status: 'ok', route: row });
    });
    app.patch(`/${prefix}/:id`, { bodyLimit: 1_000_000 }, async (req) => {
      const { user } = await principal(req, true);
      const routeId = id(req);
      const row = await tx(async (c) => {
        const old = (
          await c.query(
            'SELECT * FROM routes WHERE id=$1 AND owner_id=$2 FOR UPDATE',
            [routeId, user.id],
          )
        ).rows[0];
        if (!old || (prefix === 'circuits' && old.kind !== 'circuit'))
          throw new AuthError(404, 'Percurso não encontrado.');
        const b = routeData(req.body, old.kind === 'circuit');
        // Every edit removes publication and verification until a new review.
        await c.query(
          `UPDATE routes SET name=$3,description=$4,city=$5,state=$6,category=$7,geometry=public.ST_SetSRID(public.ST_GeomFromGeoJSON($8),4326),distance_meters=public.ST_Length(public.ST_SetSRID(public.ST_GeomFromGeoJSON($8),4326)::public.geography),duration_seconds=$9,source=$10,start_line=public.ST_SetSRID(public.ST_GeomFromGeoJSON($11),4326),direction=$12,status='draft',verification='suggested',version=version+1,reason='',updated_at=now() WHERE id=$1 AND owner_id=$2`,
          [
            routeId,
            user.id,
            b.name,
            b.description,
            b.city,
            b.state,
            b.category,
            JSON.stringify(b.geometry),
            b.durationSeconds,
            b.source,
            b.startLine ? JSON.stringify(b.startLine) : null,
            b.direction,
          ],
        );
        await c.query('DELETE FROM route_waypoints WHERE route_id=$1', [
          routeId,
        ]);
        await waypoints(c, routeId, b.waypoints);
        return (
          await c.query(`${selectRoute(true)} WHERE r.id=$2`, [
            user.id,
            routeId,
          ])
        ).rows[0];
      });
      return { status: 'ok', route: row };
    });
    app.delete(`/${prefix}/:id`, async (req) => {
      const { user } = await principal(req, true);
      const result = await db().query(
        `UPDATE routes SET status='archived',verification='suggested',updated_at=now() WHERE id=$1 AND owner_id=$2 ${prefix === 'circuits' ? "AND kind='circuit'" : ''} RETURNING id`,
        [id(req), user.id],
      );
      if (!result.rowCount)
        throw new AuthError(404, 'Percurso não encontrado.');
      return { status: 'ok' };
    });
  }
  async function waypoints(
    c: PoolClient,
    routeId: string,
    points: [number, number][],
  ) {
    await c.query(
      `INSERT INTO route_waypoints(route_id,point_order,position) SELECT $1,(p.ordinality-1)::int,public.ST_SetSRID(public.ST_MakePoint((p.value->>0)::float8,(p.value->>1)::float8),4326) FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY p(value,ordinality)`,
      [routeId, JSON.stringify(points)],
    );
  }
  app.post('/routes/:id/submit', async (req) => {
    const { user } = await principal(req, true);
    const result = await db().query(
      `UPDATE routes SET status='pending',verification='suggested',updated_at=now() WHERE id=$1 AND owner_id=$2 AND status IN ('draft','rejected') RETURNING id`,
      [id(req), user.id],
    );
    if (!result.rowCount)
      throw new AuthError(409, 'Percurso indisponível para envio.');
    return { status: 'ok' };
  });
  app.post('/routes/:id/favorite', async (req) => {
    const { user } = await principal(req, true);
    const result = await db().query(
      `INSERT INTO route_favorites(user_id,route_id) SELECT $1,id FROM routes WHERE id=$2 AND status='approved' ON CONFLICT DO NOTHING RETURNING route_id`,
      [user.id, id(req)],
    );
    if (
      !result.rowCount &&
      !(
        await db().query(
          "SELECT id FROM routes WHERE id=$1 AND status='approved'",
          [id(req)],
        )
      ).rowCount
    )
      throw new AuthError(404, 'Percurso não encontrado.');
    return { status: 'ok' };
  });
  app.delete('/routes/:id/favorite', async (req) => {
    const { user } = await principal(req, true);
    await db().query(
      'DELETE FROM route_favorites WHERE user_id=$1 AND route_id=$2',
      [user.id, id(req)],
    );
    return { status: 'ok' };
  });
  app.get('/admin/routes', async (req) => {
    const operator = await moderator(req);
    const user = operator.id;
    const q = req.query as { page?: string };
    const page = Number(q.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 1000) throw invalid();
    return {
      status: 'ok',
      routes: (
        await db().query(
          `${selectRoute()} WHERE r.status IN ('pending','approved') ORDER BY r.status DESC,r.updated_at,r.id LIMIT 50 OFFSET $2`,
          [user, (page - 1) * 50],
        )
      ).rows,
    };
  });
  app.get('/admin/routes/:id/decisions', async (req) => {
    await moderator(req);
    return {
      status: 'ok',
      decisions: (
        await db().query(
          'SELECT id,version,actor_id,action,reason,created_at FROM route_decisions WHERE route_id=$1 ORDER BY id DESC LIMIT 100',
          [id(req)],
        )
      ).rows,
    };
  });
  app.post('/admin/routes/:id/decisions', async (req) => {
    const operator = await moderator(req, true);
    const actor = operator.id;
    const b = req.body as {
      action: string;
      reason: string;
      version: number;
      closedVenue?: boolean;
      evidence?: string;
    };
    if (
      !b ||
      !['approve', 'reject', 'archive', 'verify'].includes(b.action) ||
      typeof b.reason !== 'string' ||
      b.reason.trim().length < 5 ||
      b.reason.length > 2000 ||
      !Number.isInteger(b.version)
    )
      throw invalid(
        'Informe decisão, versão e motivo de pelo menos 5 caracteres.',
      );
    await tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(220001)');
      await revalidate(c, operator, 'admin.routes.review');
      if (b.action === 'verify') {
        await revalidate(c, operator, 'admin.circuits.verify');
        adminText(b.evidence, 30, 2000);
      }
      const r = (
        await c.query(
          'SELECT *,public.ST_AsGeoJSON(geometry)::json AS line,public.ST_AsGeoJSON(start_line)::json AS gate FROM routes WHERE id=$1 FOR UPDATE',
          [id(req)],
        )
      ).rows[0];
      if (!r) throw new AuthError(404, 'Percurso não encontrado.');
      if (r.owner_id === actor)
        throw new AuthError(
          403,
          'Outro moderador deve revisar o seu percurso.',
        );
      if (r.version !== b.version)
        throw new AuthError(
          409,
          'O percurso mudou. Recarregue antes de revisar.',
        );
      if (['approve', 'reject'].includes(b.action) && r.status !== 'pending')
        throw new AuthError(409, 'A publicação não está pendente.');
      if (b.action === 'verify') {
        if (
          r.kind !== 'circuit' ||
          r.status !== 'approved' ||
          !r.gate ||
          !r.direction ||
          b.closedVenue !== true
        )
          throw invalid(
            'Verificação exige circuito aprovado, linha, direção e confirmação de área fechada autorizada.',
          );
        routeData(
          {
            name: r.name,
            description: r.description,
            city: r.city,
            state: r.state,
            category: r.category,
            geometry: r.line,
            waypoints: [r.line.coordinates[0], r.line.coordinates.at(-1)],
            source: r.source,
            durationSeconds: r.duration_seconds,
            startLine: r.gate,
            direction: r.direction,
          },
          true,
        );
      }
      const status =
        b.action === 'approve' || b.action === 'verify'
          ? 'approved'
          : b.action === 'reject'
            ? 'rejected'
            : 'archived';
      await c.query(
        'UPDATE routes SET status=$2,verification=$3,reason=$4,updated_at=now() WHERE id=$1',
        [
          r.id,
          status,
          b.action === 'verify' ? 'verified' : 'suggested',
          b.reason.trim(),
        ],
      );
      if (status === 'approved') {
        const plan = {
          id: r.id,
          version: r.version,
          name: r.name,
          kind: r.kind,
          geometry: r.line,
          distanceMeters: r.distance_meters,
          verification: b.action === 'verify' ? 'verified' : 'suggested',
          startLine: r.gate,
          direction: r.direction,
          waypoints: (
            await c.query(
              'SELECT public.ST_X(position) AS lon,public.ST_Y(position) AS lat FROM route_waypoints WHERE route_id=$1 ORDER BY point_order',
              [r.id],
            )
          ).rows.map((p) => [p.lon, p.lat]),
        };
        await c.query(
          'INSERT INTO route_versions(route_id,version,plan,verified_at) VALUES($1,$2,$3,CASE WHEN $4 THEN now() ELSE NULL END) ON CONFLICT(route_id,version) DO UPDATE SET plan=EXCLUDED.plan,verified_at=CASE WHEN $4 THEN COALESCE(route_versions.verified_at,now()) ELSE NULL END',
          [r.id, r.version, JSON.stringify(plan), b.action === 'verify'],
        );
      }
      if (b.action === 'verify')
        await c.query(
          'INSERT INTO circuit_verification_evidence(route_id,version,actor_id,closed_venue_evidence) VALUES($1,$2,$3,$4)',
          [r.id, r.version, actor, b.evidence],
        );
      await adminAudit(
        c,
        actor,
        'route_' + b.action,
        'route',
        r.id,
        b.action === 'verify' ? 'admin.circuits.verify' : 'admin.routes.review',
        req.id,
      );
      await c.query(
        'INSERT INTO route_decisions(route_id,version,actor_id,action,reason,reviewed_geometry) VALUES($1,$2,$3,$4,$5,$6)',
        [r.id, r.version, actor, b.action, b.reason.trim(), r.geometry],
      );
    });
    return { status: 'ok' };
  });
}
