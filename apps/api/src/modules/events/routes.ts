import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { digest } from '../auth/security.js';
import { AuthError } from '../auth/validation.js';
import { id, object, text } from '../social/validation.js';
import { context as groupContext, authorize } from '../groups/policy.js';
import {
  eventContext,
  manage,
  requireOpen,
  visible,
  type Db,
} from './policy.js';
import { select, detail, audit, transaction } from './store.js';
import { fields, settings, invalid, timestamp, choice } from './validation.js';
import { participationRoutes } from './participation.js';
import { liveRoutes, cleanupLive } from './live.js';

export interface EventApi {
  db: () => Pool;
  user: (r: FastifyRequest) => string;
  key: (r: FastifyRequest) => string;
}
export async function routePlan(db: Db, who: string, route: string | null) {
  if (!route) return null;
  const row = (
    await db.query(
      `SELECT v.version,v.plan FROM routes r JOIN route_versions v ON v.route_id=r.id AND v.version=r.version WHERE r.id=$2 AND r.status='approved' AND (r.owner_id=$1 OR r.status='approved')`,
      [who, route],
    )
  ).rows[0];
  if (!row) throw invalid('Rota indisponível: selecione uma versão aprovada.');
  return row;
}
export async function eventRoutes(
  app: FastifyInstance,
  options: { config: Config; pool?: Pool | undefined },
) {
  const db = () => {
    if (!options.pool)
      throw new AuthError(503, 'Eventos temporariamente indisponíveis.');
    return options.pool;
  };
  const principal = createPrincipal(options.config, db),
    users = new WeakMap<FastifyRequest, string>();
  const user = (r: FastifyRequest) => users.get(r)!;
  const key = (r: FastifyRequest) => id((r.params as { id: string }).id);
  app.addHook('onRequest', sessionGuard(options.config));
  app.addHook('onRequest', async (r, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Vary', 'Cookie');
    users.set(
      r,
      (await principal(r, !['GET', 'HEAD'].includes(r.method))).user.id,
    );
    const route = r.routeOptions.url ?? '',
      write = !['GET', 'HEAD'].includes(r.method);
    const max =
      write && route === '/api/events'
        ? 5
        : route.includes('invitations') && write
          ? 20
          : 180;
    const rate = (
      await db().query(
        `INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+interval '1 minute' ELSE auth_rate_limits.expires_at END RETURNING attempts`,
        [digest(`events:${user(r)}:${write ? route : 'read'}:${r.method}`)],
      )
    ).rows[0];
    if (rate.attempts > max)
      throw new AuthError(429, 'Limite atingido. Aguarde um minuto.');
  });
  const api = { db, user, key };
  async function search(r: FastifyRequest, mine = false) {
    const q = (r.query ?? {}) as Record<string, unknown>,
      values: unknown[] = [user(r)],
      clauses = [visible()];
    const bind = (x: unknown) => {
      values.push(x);
      return `$${values.length}`;
    };
    const page = Number(q.page ?? 1),
      limit = Number(q.limit ?? 20);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 500 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw invalid('Página inválida.');
    const filter = choice(q.filter ?? (mine ? 'mine' : 'upcoming'), [
      'upcoming',
      'mine',
      'groups',
      'public',
      'invited',
      'all',
    ]);
    if (['upcoming', 'public', 'all', 'groups'].includes(filter))
      clauses.push(
        "NOT EXISTS(SELECT 1 FROM admin_content_states ax WHERE ax.target_type='event' AND ax.target_id=e.id)",
      );
    if (filter === 'upcoming')
      clauses.push("e.status='scheduled' AND e.ends_at>now()");
    if (filter === 'mine')
      clauses.push(
        "(p.participation_status IN ('interested','confirmed','pending') OR e.organizer_id=$1)",
      );
    if (filter === 'groups') clauses.push('e.group_id IS NOT NULL');
    if (filter === 'public') clauses.push("e.visibility='public'");
    if (filter === 'invited')
      clauses.push(
        "EXISTS(SELECT 1 FROM event_invitations i WHERE i.event_id=e.id AND i.invited_user_id=$1 AND i.status='pending' AND i.expires_at>now())",
      );
    if (q.q)
      clauses.push(
        `to_tsvector('portuguese',e.title||' '||e.city||' '||e.state) @@ plainto_tsquery('portuguese',${bind(text(q.q, 100, true))})`,
      );
    if (q.city)
      clauses.push(`lower(e.city)=lower(${bind(text(q.city, 100, true))})`);
    if (q.state)
      clauses.push(`e.state=${bind(text(q.state, 2, true).toUpperCase())}`);
    if (q.type)
      clauses.push(`e.event_type=${bind(choice(q.type, ['meetup', 'ride']))}`);
    if (q.groupId) clauses.push(`e.group_id=${bind(id(q.groupId))}`);
    if (q.from) clauses.push(`e.starts_at>=${bind(timestamp(q.from))}`);
    if (q.to) clauses.push(`e.starts_at<=${bind(timestamp(q.to))}`);
    if (q.bbox) {
      const parts = String(q.bbox).split(',').map(Number);
      if (
        parts.length !== 4 ||
        parts.some((x) => !Number.isFinite(x)) ||
        parts[0]! >= parts[2]! ||
        parts[1]! >= parts[3]! ||
        parts[0]! < -180 ||
        parts[2]! > 180 ||
        parts[1]! < -85 ||
        parts[3]! > 85
      )
        throw invalid('Região inválida.');
      clauses.push(
        `e.meeting_point && public.ST_MakeEnvelope(${parts.map(bind).join(',')},4326)`,
      );
    }
    const rows = (
      await db().query(
        `${select} WHERE ${clauses.join(' AND ')} ORDER BY ${q.state || q.city ? '' : "(e.state='AL') DESC,"}e.starts_at,e.id LIMIT ${bind(limit + 1)} OFFSET ${bind((page - 1) * limit)}`,
        values,
      )
    ).rows;
    return {
      status: 'ok',
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
      page,
    };
  }
  app.get('/events', (r) => search(r));
  app.get('/events/mine', (r) => search(r, true));
  app.get('/events/:id', async (r) => ({
    status: 'ok',
    event: await detail(db(), user(r), key(r)),
  }));
  app.post('/events', { bodyLimit: 64 * 1024 }, async (r, reply) => {
    const who = user(r),
      b = settings(r.body),
      creation = id(object(r.body).creationKey);
    if (b.title.length < 3 || b.startsAt.getTime() < Date.now() - 60000)
      throw invalid(
        'Informe nome de pelo menos três caracteres e início atual ou futuro.',
      );
    const event = await transaction(db(), [who], async (c) => {
      const old = (
        await c.query(
          'SELECT id FROM social_events WHERE organizer_id=$1 AND creation_key=$2',
          [who, creation],
        )
      ).rows[0];
      if (old) return old.id as string;
      if (b.groupId) {
        const g = await groupContext(c, who, b.groupId, true);
        authorize(g, 'edit');
      }
      const plan = await routePlan(c, who, b.routeId),
        event = randomUUID();
      await c.query(
        `INSERT INTO social_events(id,organizer_id,creation_key,title,description,rules,event_type,visibility,join_policy,city,state,meeting_point,meeting_point_label,meeting_reference,starts_at,ends_at,timezone,capacity,group_id,route_id,route_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,public.ST_SetSRID(public.ST_MakePoint($12,$13),4326),$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          event,
          who,
          creation,
          b.title,
          b.description,
          b.rules,
          b.eventType,
          b.visibility,
          b.joinPolicy,
          b.city,
          b.state,
          ...b.point,
          b.label,
          b.reference,
          b.startsAt,
          b.endsAt,
          b.timezone,
          b.capacity,
          b.groupId,
          b.routeId,
          plan?.version ?? null,
        ],
      );
      await c.query(
        "INSERT INTO event_participants(event_id,user_id,participation_status) VALUES($1,$2,'confirmed')",
        [event, who],
      );
      await audit(c, event, who, 'created');
      return event;
    });
    return reply
      .code(201)
      .send({ status: 'ok', event: await detail(db(), who, event) });
  });
  app.patch('/events/:id', { bodyLimit: 64 * 1024 }, async (r) => {
    const who = user(r),
      event = key(r),
      b = settings(r.body),
      input = object(r.body);
    await transaction(db(), [who], async (c) => {
      const e = await eventContext(c, who, event, true);
      manage(e);
      requireOpen(e);
      if (input.revision !== e.revision)
        throw new AuthError(
          409,
          'Evento alterado. Recarregue antes de editar.',
        );
      if (b.groupId !== e.group_id)
        throw invalid('O grupo organizador não pode ser trocado.');
      if (b.visibility !== e.visibility && input.confirmDisclosure !== true)
        throw invalid('Confirme a mudança de visibilidade.');
      const count = (
        await c.query(
          "SELECT count(*)::int AS n FROM event_participants WHERE event_id=$1 AND participation_status='confirmed'",
          [event],
        )
      ).rows[0].n;
      if (b.capacity !== null && Number(b.capacity) < count)
        throw invalid('Capacidade menor que as presenças confirmadas.');
      const plan =
        b.routeId === e.route_id
          ? { version: e.route_version }
          : await routePlan(c, who, b.routeId);
      await c.query(
        `UPDATE social_events SET title=$2,description=$3,rules=$4,event_type=$5,visibility=$6,join_policy=$7,city=$8,state=$9,meeting_point=public.ST_SetSRID(public.ST_MakePoint($10,$11),4326),meeting_point_label=$12,meeting_reference=$13,starts_at=$14,ends_at=$15,timezone=$16,capacity=$17,route_id=$18,route_version=$19,revision=revision+1,updated_at=now() WHERE id=$1`,
        [
          event,
          b.title,
          b.description,
          b.rules,
          b.eventType,
          b.visibility,
          b.joinPolicy,
          b.city,
          b.state,
          ...b.point,
          b.label,
          b.reference,
          b.startsAt,
          b.endsAt,
          b.timezone,
          b.capacity,
          b.routeId,
          plan?.version ?? null,
        ],
      );
      await c.query(
        'UPDATE live_location_sessions SET revoked_at=now() WHERE event_id=$1 AND revoked_at IS NULL',
        [event],
      );
      await c.query('DELETE FROM live_location_positions WHERE event_id=$1', [
        event,
      ]);
      await audit(c, event, who, 'edited');
    });
    return { status: 'ok', event: await detail(db(), who, event) };
  });
  for (const action of ['cancel', 'finish'] as const) {
    const stop = async (r: FastifyRequest) => {
      const who = user(r),
        event = key(r);
      fields(r.body ?? {}, []);
      await transaction(db(), [who], async (c) => {
        const e = await eventContext(c, who, event, true);
        manage(e);
        if (e.status === 'cancelled' && action === 'finish')
          throw new AuthError(409, 'Evento cancelado.');
        await c.query(
          'UPDATE social_events SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1',
          [event, action === 'cancel' ? 'cancelled' : 'finished'],
        );
        await c.query(
          'UPDATE live_location_sessions SET revoked_at=now() WHERE event_id=$1 AND revoked_at IS NULL',
          [event],
        );
        await c.query('DELETE FROM live_location_positions WHERE event_id=$1', [
          event,
        ]);
        await audit(c, event, who, action);
      });
      return { status: 'ok' };
    };
    app.post(`/events/:id/${action}`, stop);
    if (action === 'cancel') app.delete('/events/:id', stop);
  }
  app.get('/events/:id/map', async (r) => {
    const who = user(r),
      e = await detail(db(), who, key(r));
    const route = e.route_id
      ? (
          await db().query(
            'SELECT v.plan,r.status AS availability FROM route_versions v JOIN routes r ON r.id=v.route_id WHERE v.route_id=$1 AND v.version=$2',
            [e.route_id, e.route_version],
          )
        ).rows[0]
      : null;
    return { status: 'ok', event: e, route };
  });
  app.post('/events/:id/ride-association', async (r) => {
    const who = user(r),
      event = key(r);
    fields(r.body ?? {}, []);
    const authorization = await transaction(db(), [who], async (c) => {
      const e = await eventContext(c, who, event, true);
      requireOpen(e);
      if (e.event_type !== 'ride' || !e.confirmed)
        throw new AuthError(
          403,
          'Confirme sua presença neste passeio antes de preparar o Ride.',
        );
      return (
        await c.query(
          'INSERT INTO event_ride_authorizations(id,event_id,user_id,expires_at) VALUES($1,$2,$3,$4) RETURNING id',
          [randomUUID(), event, who, e.ends_at],
        )
      ).rows[0];
    });
    return {
      status: 'ok',
      event: await detail(db(), who, event),
      authorizationId: authorization.id,
    };
  });
  app.patch('/events/:id/image', async (r) => {
    const who = user(r),
      event = key(r),
      b = fields(r.body, ['mediaId']),
      media = b.mediaId === null ? null : id(b.mediaId);
    await transaction(db(), [who], async (c) => {
      const e = await eventContext(c, who, event, true);
      manage(e);
      requireOpen(e);
      await c.query('SELECT pg_advisory_xact_lock(180017)');
      if (media) {
        const m = (
          await c.query(
            "SELECT id FROM social_post_media WHERE id=$1 AND owner_id=$2 AND (event_id=$3 OR (event_id IS NULL AND post_id IS NULL AND group_id IS NULL AND created_at>now()-interval '1 hour')) FOR UPDATE",
            [media, who, event],
          )
        ).rows[0];
        if (!m) throw invalid('Imagem indisponível ou de outra publicação.');
      }
      const old = (
        await c.query(
          'DELETE FROM social_post_media WHERE event_id=$1 AND ($2::uuid IS NULL OR id<>$2) RETURNING file_ref,thumbnail_ref',
          [event, media],
        )
      ).rows;
      for (const row of old)
        for (const ref of [row.file_ref, row.thumbnail_ref])
          await c.query(
            'INSERT INTO social_media_cleanup(file_ref) VALUES($1) ON CONFLICT(file_ref) DO UPDATE SET available_at=now()',
            [ref],
          );
      if (media)
        await c.query('UPDATE social_post_media SET event_id=$2 WHERE id=$1', [
          media,
          event,
        ]);
      await c.query(
        'UPDATE social_events SET revision=revision+1,updated_at=now() WHERE id=$1',
        [event],
      );
      await audit(c, event, who, 'image_changed');
    });
    return { status: 'ok' };
  });
  app.post('/events/:id/organizers/:userId', async (r) => {
    const who = user(r),
      event = key(r),
      target = id((r.params as { userId: string }).userId);
    fields(r.body ?? {}, []);
    await transaction(db(), [who, target], async (c) => {
      const e = await eventContext(c, who, event, true);
      requireOpen(e);
      if (!e.is_primary)
        throw new AuthError(
          403,
          'Somente o organizador principal pode designar coorganizadores.',
        );
      const t = await eventContext(c, target, event);
      if (!t.confirmed) throw invalid('Escolha um participante confirmado.');
      if (e.group_id) {
        const g = await groupContext(c, target, e.group_id);
        authorize(g, 'edit');
      }
      await c.query(
        'INSERT INTO event_organizers(event_id,user_id,granted_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [event, target, who],
      );
      await audit(c, event, who, 'coorganizer_granted', target);
    });
    return { status: 'ok' };
  });
  app.delete('/events/:id/organizers/:userId', async (r) => {
    const who = user(r),
      event = key(r),
      target = id((r.params as { userId: string }).userId);
    await transaction(db(), [who, target], async (c) => {
      const e = await eventContext(c, who, event, true);
      if (!e.is_primary)
        throw new AuthError(403, 'Somente o organizador principal.');
      await c.query(
        'DELETE FROM event_organizers WHERE event_id=$1 AND user_id=$2',
        [event, target],
      );
      await audit(c, event, who, 'coorganizer_revoked', target);
    });
    return { status: 'ok' };
  });
  await participationRoutes(app, api);
  await liveRoutes(app, api);
  if (options.pool && options.config.nodeEnv !== 'test') {
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void cleanupLive(db())
        .catch(() =>
          app.log.error(
            { event: 'live_cleanup_failed' },
            'Falha na limpeza temporária',
          ),
        )
        .finally(() => {
          running = false;
        });
    }, 5000);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
    });
  }
}
