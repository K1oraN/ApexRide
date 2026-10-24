import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { EventApi } from './routes.js';
import { AuthError } from '../auth/validation.js';
import { id } from '../social/validation.js';
import { notBlocked } from '../social/block-policy.js';
import { eventContext, liveEligible, staff, type Db } from './policy.js';
import { transaction } from './store.js';
import { choice, fields, invalid, point } from './validation.js';
export const LIVE = {
  pollMs: 5000,
  minUpdateMs: 5000,
  staleMs: 15000,
  ttlMs: 30000,
  maxAgeMs: 10000,
  maxAccuracy: 200,
  maxSessions: 200,
  retentionDays: 7,
} as const;
export function consent(value: unknown) {
  const b = fields(value, [
    'consent',
    'consentVersion',
    'audience',
    'precision',
    'durationMinutes',
  ]);
  if (b.consent !== true || b.consentVersion !== 'live-v1')
    throw invalid('Consentimento explícito necessário.');
  if (
    ![15, 30, 60, 120, 240].includes(Number(b.durationMinutes)) ||
    typeof b.durationMinutes !== 'number'
  )
    throw invalid('Duração inválida.');
  return {
    audience: choice(b.audience, ['organizers', 'confirmed']),
    precision: choice(b.precision, ['approximate', 'precise']),
    minutes: b.durationMinutes,
  };
}
export function position(value: unknown, now = Date.now()) {
  const b = fields(value, [
    'sessionId',
    'longitude',
    'latitude',
    'accuracy',
    'timestamp',
  ]);
  const coordinates = point([b.longitude, b.latitude]);
  if (
    typeof b.accuracy !== 'number' ||
    !Number.isFinite(b.accuracy) ||
    b.accuracy < 0 ||
    b.accuracy > LIVE.maxAccuracy
  )
    throw invalid('Precisão GPS insuficiente.');
  if (
    !Number.isSafeInteger(b.timestamp) ||
    Number(b.timestamp) < now - LIVE.maxAgeMs ||
    Number(b.timestamp) > now + 2000
  )
    throw invalid('Posição antiga ou horário inválido.');
  return {
    id: id(b.sessionId),
    longitude: coordinates[0],
    latitude: coordinates[1],
    accuracy: b.accuracy,
    timestamp: Number(b.timestamp),
  };
}
export function approximate(lon: number, lat: number, accuracy: number) {
  // Quantize BEFORE persistence. The conservative radius covers the entire cell.
  const latitude = Math.round(lat * 100) / 100,
    longitude = Math.round(lon * 100) / 100;
  return { longitude, latitude, accuracy: Math.max(1600, accuracy) };
}
export async function cleanupLive(db: Db) {
  await db.query(
    `DELETE FROM live_location_positions p USING live_location_sessions s,social_events e WHERE p.session_id=s.id AND e.id=s.event_id AND (p.expires_at<=now() OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR NOT (${liveEligible('e', 's.user_id')}))`,
  );
  await db.query(
    `UPDATE live_location_sessions s SET revoked_at=now() FROM social_events e WHERE s.event_id=e.id AND s.revoked_at IS NULL AND (s.expires_at<=now() OR NOT (${liveEligible('e', 's.user_id')}))`,
  );
  await db.query(
    "DELETE FROM live_location_sessions WHERE expires_at<now()-interval '7 days'",
  );
  await db.query(
    "DELETE FROM event_actions WHERE created_at<now()-interval '90 days'",
  );
}
export async function liveRoutes(
  app: FastifyInstance,
  { db, user, key }: EventApi,
) {
  async function assertLive(c: Db, who: string, event: string) {
    const row = (
      await c.query(
        `SELECT e.id FROM social_events e WHERE e.id=$2 AND (${liveEligible()})`,
        [who, event],
      )
    ).rows[0];
    if (!row)
      throw new AuthError(
        403,
        'Mapa social exige presença confirmada e evento em andamento.',
      );
  }
  app.post('/events/:id/live-location/start', async (r) => {
    const who = user(r),
      event = key(r),
      b = consent(r.body);
    const session = await transaction(db(), [who], async (c) => {
      await eventContext(c, who, event, true);
      await assertLive(c, who, event);
      const count = (
        await c.query(
          'SELECT count(*)::int AS n FROM live_location_sessions WHERE event_id=$1 AND revoked_at IS NULL AND expires_at>now() AND user_id<>$2',
          [event, who],
        )
      ).rows[0].n;
      if (count >= LIVE.maxSessions)
        throw new AuthError(
          409,
          'Limite de compartilhamentos simultâneos atingido.',
        );
      await c.query(
        'UPDATE live_location_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [who],
      );
      await c.query('DELETE FROM live_location_positions WHERE user_id=$1', [
        who,
      ]);
      return (
        await c.query(
          `INSERT INTO live_location_sessions(id,event_id,user_id,audience_scope,precision_mode,consent_version,expires_at) SELECT $1,e.id,$2,$3,$4,'live-v1',least(e.ends_at,now()+$5*interval '1 minute') FROM social_events e WHERE e.id=$6 RETURNING id,audience_scope,precision_mode,started_at,expires_at`,
          [randomUUID(), who, b.audience, b.precision, b.minutes, event],
        )
      ).rows[0];
    });
    return { status: 'ok', session, policy: LIVE };
  });
  app.post('/events/:id/live-location/stop', async (r) => {
    const who = user(r),
      event = key(r),
      b = fields(r.body, ['sessionId']),
      session = id(b.sessionId);
    await transaction(db(), [who], async (c) => {
      // Scoped stop cannot revoke a later session started in another tab.
      await c.query(
        'UPDATE live_location_sessions SET revoked_at=now() WHERE id=$1 AND event_id=$2 AND user_id=$3 AND revoked_at IS NULL',
        [session, event, who],
      );
      await c.query(
        'DELETE FROM live_location_positions WHERE session_id=$1 AND event_id=$2 AND user_id=$3',
        [session, event, who],
      );
    });
    return { status: 'ok' };
  });
  app.get('/events/:id/live-location/me', async (r) => {
    const who = user(r),
      event = key(r);
    await eventContext(db(), who, event);
    const session =
      (
        await db().query(
          `SELECT s.id,s.audience_scope,s.precision_mode,s.started_at,s.expires_at,s.last_update_at FROM live_location_sessions s JOIN social_events e ON e.id=s.event_id WHERE s.event_id=$2 AND s.user_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND (${liveEligible()}) ORDER BY s.started_at DESC LIMIT 1`,
          [who, event],
        )
      ).rows[0] ?? null;
    return { status: 'ok', session, policy: LIVE };
  });
  app.post('/events/:id/live-location/position', async (r) => {
    const who = user(r),
      event = key(r),
      p = position(r.body);
    await transaction(db(), [who], async (c) => {
      await c.query('SELECT id FROM social_events WHERE id=$1 FOR UPDATE', [
        event,
      ]);
      await assertLive(c, who, event);
      const s = (
        await c.query(
          'SELECT * FROM live_location_sessions WHERE id=$1 AND event_id=$2 AND user_id=$3 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',
          [p.id, event, who],
        )
      ).rows[0];
      if (!s)
        throw new AuthError(
          410,
          'Compartilhamento encerrado ou expirado. Autorize uma nova sessão.',
        );
      if (
        p.timestamp < new Date(s.started_at).getTime() ||
        (s.last_recorded_at &&
          p.timestamp <= new Date(s.last_recorded_at).getTime())
      )
        throw invalid(
          'Posição anterior ao consentimento, duplicada ou fora de ordem.',
        );
      if (
        s.last_update_at &&
        Date.now() - new Date(s.last_update_at).getTime() < LIVE.minUpdateMs
      )
        throw new AuthError(429, 'Aguarde cinco segundos entre posições.');
      const pos =
        s.precision_mode === 'approximate'
          ? approximate(p.longitude, p.latitude, p.accuracy)
          : p;
      await c.query(
        `INSERT INTO live_location_positions(session_id,event_id,user_id,longitude,latitude,accuracy,recorded_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,least($8,now()+interval '30 seconds')) ON CONFLICT(event_id,user_id) DO UPDATE SET session_id=$1,longitude=$4,latitude=$5,accuracy=$6,recorded_at=$7,received_at=now(),expires_at=least($8,now()+interval '30 seconds')`,
        [
          p.id,
          event,
          who,
          pos.longitude,
          pos.latitude,
          pos.accuracy,
          new Date(p.timestamp),
          s.expires_at,
        ],
      );
      await c.query(
        'UPDATE live_location_sessions SET last_recorded_at=$2,last_update_at=now() WHERE id=$1',
        [p.id, new Date(p.timestamp)],
      );
    });
    return { status: 'ok', receivedAt: new Date().toISOString() };
  });
  app.get('/events/:id/live-location/participants', async (r) => {
    const who = user(r),
      event = key(r);
    await assertLive(db(), who, event);
    const items = (
      await db().query(
        `SELECT s.id,p.user_id,u.display_name,p.longitude,p.latitude,p.accuracy,p.recorded_at,p.received_at,p.expires_at,s.precision_mode,CASE WHEN p.received_at<now()-interval '15 seconds' THEN 'stale' ELSE 'fresh' END AS freshness FROM live_location_positions p JOIN live_location_sessions s ON s.id=p.session_id JOIN social_events e ON e.id=s.event_id JOIN users u ON u.id=p.user_id WHERE p.event_id=$2 AND p.expires_at>now() AND s.revoked_at IS NULL AND s.expires_at>now() AND (${liveEligible('e', 's.user_id')}) AND (${liveEligible()}) AND ${notBlocked('s.user_id')} AND (s.user_id=$1 OR s.audience_scope='confirmed' OR (s.audience_scope='organizers' AND ${staff()})) ORDER BY p.user_id LIMIT 200`,
        [who, event],
      )
    ).rows;
    return {
      status: 'ok',
      items,
      serverTime: new Date().toISOString(),
      policy: LIVE,
    };
  });
}
