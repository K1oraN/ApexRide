import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AuthError } from '../auth/validation.js';
import { id } from '../social/validation.js';
import { notBlocked } from '../social/block-policy.js';
import {
  eventContext,
  manage,
  requireOpen,
  visible,
  staff,
  eligible,
  confirmed,
  type Db,
} from './policy.js';
import { transaction, audit } from './store.js';
import { choice, fields, invalid, timestamp } from './validation.js';
import type { EventApi } from './routes.js';

export async function rsvp(
  db: Db,
  who: string,
  event: string,
  status: 'confirmed' | 'interested',
  invitation = false,
) {
  const e = await eventContext(db, who, event, true);
  requireOpen(e);
  if (['removed', 'rejected'].includes(e.participation_status))
    throw new AuthError(
      403,
      'Participação removida ou recusada. Consulte a organização.',
    );
  const next =
    status === 'confirmed' && e.join_policy === 'approval' && !e.can_manage
      ? 'pending'
      : status;
  if (e.participation_status === 'confirmed' && status === 'confirmed') return;
  if (
    e.visibility === 'invite' &&
    !invitation &&
    !e.can_manage &&
    !['confirmed', 'pending'].includes(e.participation_status)
  ) {
    throw new AuthError(403, 'Aceite o convite para participar.');
  }
  if (next === 'confirmed') await capacity(db, event, e.capacity);
  await db.query(
    `INSERT INTO event_participants(event_id,user_id,participation_status) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET participation_status=$3,updated_at=now()`,
    [event, who, next],
  );
  if (next !== 'confirmed') await revoke(db, event, who);
  await audit(db, event, who, next);
}
async function capacity(db: Db, event: string, max: number | null) {
  if (max === null) return;
  const count = (
    await db.query(
      "SELECT count(*)::int AS n FROM event_participants WHERE event_id=$1 AND participation_status='confirmed'",
      [event],
    )
  ).rows[0].n;
  if (count >= max) throw new AuthError(409, 'Evento lotado.');
}
export async function revoke(db: Db, event: string, who: string) {
  await db.query(
    'UPDATE live_location_sessions SET revoked_at=now() WHERE event_id=$1 AND user_id=$2 AND revoked_at IS NULL',
    [event, who],
  );
  await db.query(
    'DELETE FROM live_location_positions WHERE event_id=$1 AND user_id=$2',
    [event, who],
  );
}
export async function participationRoutes(
  app: FastifyInstance,
  { db, user, key }: EventApi,
) {
  app.post('/events/:id/rsvp', async (r) => {
    const who = user(r),
      event = key(r),
      b = fields(r.body, ['status']);
    await transaction(db(), [who], (c) =>
      rsvp(c, who, event, choice(b.status, ['confirmed', 'interested'])),
    );
    return { status: 'ok' };
  });
  app.delete('/events/:id/rsvp', async (r) => {
    const who = user(r),
      event = key(r);
    await transaction(db(), [who], async (c) => {
      // A stop/leave must still work after loss of event access.
      await c.query('SELECT id FROM social_events WHERE id=$1 FOR UPDATE', [
        event,
      ]);
      await revoke(c, event, who);
      await c.query(
        "UPDATE event_participants SET participation_status='cancelled',updated_at=now() WHERE event_id=$1 AND user_id=$2 AND participation_status NOT IN ('removed','rejected')",
        [event, who],
      );
    });
    return { status: 'ok' };
  });
  app.get('/events/:id/participants', async (r) => {
    const who = user(r),
      event = key(r),
      e = await eventContext(db(), who, event);
    if (!e.confirmed && !e.can_manage)
      throw new AuthError(
        403,
        'Lista disponível somente para participantes confirmados e organização.',
      );
    const q = (r.query ?? {}) as Record<string, unknown>,
      page = Number(q.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 500)
      throw invalid('Página inválida.');
    const rows = (
      await db().query(
        `SELECT p.user_id,u.display_name,p.participation_status,(${staff('e', 'p.user_id')}) AS organizer,CASE WHEN (${staff()}) THEN COALESCE((SELECT a.revoked_at IS NULL FROM event_attendance a WHERE a.event_id=e.id AND a.user_id=p.user_id),false) ELSE NULL END AS attendance_verified FROM event_participants p JOIN users u ON u.id=p.user_id JOIN social_events e ON e.id=p.event_id WHERE p.event_id=$2 AND (${visible()}) AND ((${confirmed()}) OR (${staff()})) AND (${eligible('e', 'p.user_id')}) AND ${notBlocked('p.user_id')} AND (($3::boolean AND (${staff()})) OR p.participation_status='confirmed') ORDER BY p.joined_at,p.user_id LIMIT 51 OFFSET $4`,
        [who, event, e.can_manage, (page - 1) * 50],
      )
    ).rows;
    return {
      status: 'ok',
      items: rows.slice(0, 50),
      hasMore: rows.length > 50,
    };
  });
  app.patch('/events/:id/participants/:userId', async (r) => {
    const who = user(r),
      event = key(r),
      target = id((r.params as { userId: string }).userId),
      b = fields(r.body, ['status']),
      status = choice(b.status, ['confirmed', 'rejected', 'removed']);
    await transaction(db(), [who, target], async (c) => {
      const e = await eventContext(c, who, event, true);
      manage(e);
      requireOpen(e);
      if (target === e.organizer_id || target === who)
        throw new AuthError(
          403,
          'Use o cancelamento de sua presença. O organizador principal é preservado.',
        );
      const t = (
        await c.query(
          'SELECT participation_status FROM event_participants WHERE event_id=$1 AND user_id=$2',
          [event, target],
        )
      ).rows[0];
      if (!t) throw invalid('Participação não encontrada.');
      if (status === 'confirmed') {
        await eventContext(c, target, event);
        if (t.participation_status !== 'pending')
          throw invalid('Aprovação exige uma solicitação pendente.');
        await capacity(c, event, e.capacity);
      }
      await c.query(
        'UPDATE event_participants SET participation_status=$3,updated_at=now() WHERE event_id=$1 AND user_id=$2',
        [event, target, status],
      );
      if (status !== 'confirmed') {
        await revoke(c, event, target);
        await c.query(
          'DELETE FROM event_organizers WHERE event_id=$1 AND user_id=$2',
          [event, target],
        );
        await c.query(
          "UPDATE event_invitations SET status='revoked' WHERE event_id=$1 AND invited_user_id=$2",
          [event, target],
        );
      }
      await audit(c, event, who, status, target);
    });
    return { status: 'ok' };
  });
  app.post('/events/:id/invitations', async (r) => {
    const who = user(r),
      event = key(r),
      b = fields(r.body, ['userId', 'expiresAt']),
      target = id(b.userId),
      expires = timestamp(b.expiresAt);
    if (
      expires.getTime() <= Date.now() ||
      expires.getTime() > Date.now() + 30 * 86400000
    )
      throw invalid('Convite deve durar até trinta dias.');
    const invitation = await transaction(db(), [who, target], async (c) => {
      const e = await eventContext(c, who, event, true);
      manage(e);
      requireOpen(e);
      const eligibleTarget = (
        await c.query(
          `SELECT e.id FROM social_events e WHERE e.id=$2 AND (${eligible('e', '$1')}) AND ${notBlocked('$3', '$1')}`,
          [target, event, who],
        )
      ).rowCount;
      if (!eligibleTarget)
        throw new AuthError(404, 'Destinatário indisponível.');
      const removed = (
        await c.query(
          "SELECT 1 FROM event_participants WHERE event_id=$1 AND user_id=$2 AND participation_status IN ('removed','rejected')",
          [event, target],
        )
      ).rowCount;
      if (removed)
        throw new AuthError(403, 'Participação removida ou recusada.');
      const old = (
        await c.query(
          'SELECT id,status,expires_at FROM event_invitations WHERE event_id=$1 AND invited_user_id=$2',
          [event, target],
        )
      ).rows[0];
      if (old?.status === 'pending' && old.expires_at.getTime() > Date.now())
        return old.id as string;
      const invitation = old?.id ?? randomUUID();
      await c.query(
        "INSERT INTO event_invitations(id,event_id,invited_user_id,invited_by,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_id,invited_user_id) DO UPDATE SET status='pending',invited_by=$4,expires_at=$5,created_at=now()",
        [invitation, event, target, who, expires],
      );
      await audit(c, event, who, 'invited', target);
      return invitation;
    });
    return { status: 'ok', invitation: { id: invitation } };
  });
  app.get('/events/invitations/mine', async (r) => {
    const who = user(r);
    const rows = (
      await db().query(
        `SELECT i.id,i.event_id,e.title,e.starts_at,e.timezone,i.expires_at FROM event_invitations i JOIN social_events e ON e.id=i.event_id WHERE i.invited_user_id=$1 AND i.status='pending' AND i.expires_at>now() AND ${visible()} AND ${staff('e', 'i.invited_by')} AND ${notBlocked('i.invited_by')} ORDER BY i.created_at DESC LIMIT 50`,
        [who],
      )
    ).rows;
    return { status: 'ok', items: rows };
  });
  app.get('/events/:id/invitations', async (r) => {
    const who = user(r),
      event = key(r),
      e = await eventContext(db(), who, event);
    manage(e);
    const q = (r.query ?? {}) as { page?: string },
      page = Number(q.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 500)
      throw invalid('Página inválida.');
    const rows = (
      await db().query(
        `SELECT i.id,i.invited_user_id,u.display_name,CASE WHEN i.status='pending' AND i.expires_at<=now() THEN 'expired' ELSE i.status END AS status,i.expires_at FROM event_invitations i JOIN users u ON u.id=i.invited_user_id JOIN social_events e ON e.id=i.event_id WHERE i.event_id=$2 AND (${visible()}) AND (${staff()}) AND ${notBlocked('i.invited_user_id')} ORDER BY i.created_at DESC,i.id LIMIT 51 OFFSET $3`,
        [who, event, (page - 1) * 50],
      )
    ).rows;
    return {
      status: 'ok',
      items: rows.slice(0, 50),
      hasMore: rows.length > 50,
    };
  });
  for (const action of ['accept', 'reject'] as const)
    app.post(`/events/invitations/:id/${action}`, async (r) => {
      const who = user(r),
        invitation = key(r);
      fields(r.body ?? {}, []);
      await transaction(db(), [who], async (c) => {
        const i = (
          await c.query(
            'SELECT * FROM event_invitations WHERE id=$1 AND invited_user_id=$2',
            [invitation, who],
          )
        ).rows[0];
        if (!i) throw new AuthError(404, 'Convite indisponível.');
        const e = await eventContext(c, who, i.event_id, true);
        requireOpen(e);
        const valid = (
          await c.query(
            `SELECT i.id FROM event_invitations i JOIN social_events e ON e.id=i.event_id WHERE i.id=$2 AND i.invited_user_id=$1 AND i.status='pending' AND i.expires_at>now() AND ${staff('e', 'i.invited_by')} AND ${notBlocked('i.invited_by')}`,
            [who, invitation],
          )
        ).rowCount;
        if (!valid) throw new AuthError(410, 'Convite expirado ou revogado.');
        if (action === 'accept')
          await rsvp(c, who, i.event_id, 'confirmed', true);
        await c.query('UPDATE event_invitations SET status=$2 WHERE id=$1', [
          invitation,
          action === 'accept' ? 'accepted' : 'rejected',
        ]);
        if (action === 'reject') {
          await revoke(c, i.event_id, who);
          await c.query(
            "UPDATE event_participants SET participation_status='cancelled',updated_at=now() WHERE event_id=$1 AND user_id=$2",
            [i.event_id, who],
          );
        }
      });
      return { status: 'ok' };
    });
  app.delete('/events/:id/invitations/:invitationId', async (r) => {
    const who = user(r),
      event = key(r),
      invitation = id((r.params as { invitationId: string }).invitationId);
    await transaction(db(), [who], async (c) => {
      const e = await eventContext(c, who, event, true);
      manage(e);
      await c.query(
        "UPDATE event_invitations SET status='revoked' WHERE event_id=$1 AND id=$2 AND status='pending'",
        [event, invitation],
      );
      await audit(c, event, who, 'invitation_revoked');
    });
    return { status: 'ok' };
  });
}
