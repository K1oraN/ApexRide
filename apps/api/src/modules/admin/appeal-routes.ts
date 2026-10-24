import { revalidate } from './policy.js';
import { reconcileUser } from '../gamification/engine.js';
import { randomUUID } from 'node:crypto';
import type { AdminContext } from './context.js';
import { createPrincipal } from '../auth/session.js';
import { AuthError } from '../auth/validation.js';
import { moderateContent } from './content.js';
import * as v from './validation.js';
export function registerAppeals(ctx: AdminContext) {
  const { app, db, config, principal, param, tx, audit } = ctx,
    common = createPrincipal(config, db);
  app.get('/moderation/me', async (r) => {
    const { user } = await common(r);
    return {
      sanctions: (
        await db().query(
          'SELECT id,sanction_type,scope,reason,policy_code,begins_at,expires_at,revoked_at FROM moderation_sanctions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
          [user.id],
        )
      ).rows,
      decisions: (
        await db().query(
          `SELECT d.id,d.action,d.reason_code,d.explanation,d.created_at FROM moderation_decisions d JOIN moderation_cases c ON c.id=d.case_id WHERE (c.target_type IN ('profile','group_member') AND c.target_id=$1) OR (c.target_type='post' AND EXISTS(SELECT 1 FROM social_posts p WHERE p.id=c.target_id AND p.author_id=$1)) OR (c.target_type='comment' AND EXISTS(SELECT 1 FROM social_post_comments p WHERE p.id=c.target_id AND p.author_id=$1)) OR (c.target_type='photo' AND EXISTS(SELECT 1 FROM social_post_media p WHERE p.id=c.target_id AND p.owner_id=$1)) OR (c.target_type='group' AND EXISTS(SELECT 1 FROM groups p WHERE p.id=c.target_id AND p.owner_id=$1)) OR (c.target_type='event' AND EXISTS(SELECT 1 FROM social_events p WHERE p.id=c.target_id AND p.organizer_id=$1)) ORDER BY d.created_at DESC LIMIT 30`,
          [user.id],
        )
      ).rows,
      appeals: (
        await db().query(
          'SELECT id,decision_id,sanction_id,status,resolution,created_at FROM moderation_appeals WHERE appellant_id=$1 ORDER BY created_at DESC LIMIT 30',
          [user.id],
        )
      ).rows,
    };
  });
  app.post('/moderation/appeals', async (r) => {
    const { user } = await common(r, true),
      b = v.fields(r.body, ['decisionId', 'sanctionId', 'explanation']);
    const decision = b.decisionId == null ? null : v.id(b.decisionId),
      sanction = b.sanctionId == null ? null : v.id(b.sanctionId),
      explanation = v.text(b.explanation, 5, 2000);
    if (Number(!!decision) + Number(!!sanction) !== 1) throw v.invalid();
    // Ownership checked in SQL. Reporter identity is never included.
    const owned = sanction
      ? (
          await db().query(
            'SELECT 1 FROM moderation_sanctions WHERE id=$1 AND user_id=$2',
            [sanction, user.id],
          )
        ).rowCount
      : (
          await db().query(
            `SELECT 1 FROM moderation_decisions d JOIN moderation_cases c ON c.id=d.case_id WHERE d.id=$1 AND ((c.target_type IN ('profile','group_member') AND c.target_id=$2) OR (c.target_type='post' AND EXISTS(SELECT 1 FROM social_posts p WHERE p.id=c.target_id AND p.author_id=$2)) OR (c.target_type='comment' AND EXISTS(SELECT 1 FROM social_post_comments p WHERE p.id=c.target_id AND p.author_id=$2)) OR (c.target_type='photo' AND EXISTS(SELECT 1 FROM social_post_media p WHERE p.id=c.target_id AND p.owner_id=$2)) OR (c.target_type='group' AND EXISTS(SELECT 1 FROM groups p WHERE p.id=c.target_id AND p.owner_id=$2)) OR (c.target_type='event' AND EXISTS(SELECT 1 FROM social_events p WHERE p.id=c.target_id AND p.organizer_id=$2)))`,
            [decision, user.id],
          )
        ).rowCount;
    if (!owned) throw new AuthError(404, 'Decisão indisponível.');
    const result = await db().query(
      'INSERT INTO moderation_appeals(id,decision_id,sanction_id,appellant_id,explanation) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id',
      [randomUUID(), decision, sanction, user.id, explanation],
    );
    if (!result.rowCount) throw new AuthError(409, 'Recurso já enviado.');
    return { status: 'ok', id: result.rows[0].id };
  });
  app.get('/admin/appeals', async (r) => {
    await principal(r, 'admin.reports.review');
    const q = v.page(r.query);
    const rows = (
      await db().query(
        "SELECT id,decision_id,sanction_id,explanation,status,created_at FROM moderation_appeals WHERE ($1='' OR status=$1) ORDER BY created_at,id LIMIT 31 OFFSET $2",
        [q.status, q.offset],
      )
    ).rows;
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.post('/admin/appeals/:id/resolve', async (r) => {
    const p = 'admin.reports.review',
      op = await principal(r, p, true),
      key = param(r),
      b = v.fields(r.body, ['decision', 'reason']),
      decision = v.choice(b.decision, ['upheld', 'overturned']),
      reason = v.text(b.reason, 5, 2000);
    return tx(op, p, async (c) => {
      const a = (
        await c.query(
          'SELECT * FROM moderation_appeals WHERE id=$1 FOR UPDATE',
          [key],
        )
      ).rows[0];
      if (!a || a.status !== 'open')
        throw new AuthError(409, 'Recurso já decidido ou indisponível.');
      let actor: string;
      if (a.sanction_id) {
        actor = (
          await c.query(
            'SELECT applied_by FROM moderation_sanctions WHERE id=$1',
            [a.sanction_id],
          )
        ).rows[0].applied_by;
      } else {
        actor = (
          await c.query(
            'SELECT reviewer_id FROM moderation_decisions WHERE id=$1',
            [a.decision_id],
          )
        ).rows[0].reviewer_id;
      }
      if (actor === op.id || a.appellant_id === op.id)
        throw new AuthError(403, 'Outro operador deve revisar a decisão.');
      if (decision === 'overturned') {
        if (a.sanction_id) {
          const s = (
            await c.query(
              'SELECT scope FROM moderation_sanctions WHERE id=$1',
              [a.sanction_id],
            )
          ).rows[0];
          await revalidate(
            c,
            op,
            s.scope === 'account'
              ? 'admin.users.suspend'
              : 'admin.users.restrict',
          );
          if (
            !op.permissions.includes(
              s.scope === 'account'
                ? 'admin.users.suspend'
                : 'admin.users.restrict',
            )
          )
            throw new AuthError(
              403,
              'Sem permissão para reverter esta medida.',
            );
          await c.query(
            'UPDATE moderation_sanctions SET revoked_at=now(),revoked_by=$2 WHERE id=$1',
            [a.sanction_id, op.id],
          );
        } else {
          const d = (
            await c.query(
              'SELECT c.target_type,c.target_id,c.id,d.metadata FROM moderation_decisions d JOIN moderation_cases c ON c.id=d.case_id WHERE d.id=$1',
              [a.decision_id],
            )
          ).rows[0];
          if (['achievement', 'ranking'].includes(d.metadata?.kind)) {
            const latest = (
              await c.query(
                `SELECT md.id FROM moderation_decisions md JOIN moderation_cases mc ON mc.id=md.case_id WHERE mc.target_type='profile' AND mc.target_id=$1 AND md.metadata->>'kind'=$2 AND (($2='achievement' AND md.metadata->>'code'=$3) OR ($2='ranking' AND md.metadata->>'season'=$3)) ORDER BY md.created_at DESC,md.id DESC LIMIT 1`,
                [
                  d.target_id,
                  d.metadata.kind,
                  d.metadata.kind === 'achievement'
                    ? d.metadata.code
                    : d.metadata.season,
                ],
              )
            ).rows[0];
            if (latest?.id !== a.decision_id)
              throw new AuthError(
                409,
                'Há uma decisão posterior para este recurso. Revise o caso atual.',
              );
          }
          if (d.metadata?.kind === 'achievement') {
            await revalidate(c, op, 'admin.xp.adjust');
            await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
              d.target_id,
            ]);
            await c.query(
              'DELETE FROM admin_achievement_states WHERE user_id=$1 AND achievement_code=$2',
              [d.target_id, d.metadata.code],
            );
            await reconcileUser(c, d.target_id, 100, op.id);
          } else if (d.metadata?.kind === 'ranking') {
            await revalidate(c, op, 'admin.rankings.manage');
            await c.query(
              'DELETE FROM admin_ranking_entries WHERE user_id=$1 AND season_id=$2',
              [d.target_id, d.metadata.season],
            );
            await c.query(
              "UPDATE leaderboard_seasons SET revision=revision+1 WHERE id=$1 AND status IN ('closed','archived')",
              [d.metadata.season],
            );
          } else
            await moderateContent(
              c,
              op,
              d.target_type,
              d.target_id,
              'restore',
              d.id,
              reason,
              r.id,
            );
        }
      }
      await c.query(
        'UPDATE moderation_appeals SET status=$2,resolution=$3,assigned_reviewer=$4,resolved_at=now() WHERE id=$1',
        [key, decision, reason, op.id],
      );
      await audit(c, op.id, 'appeal_' + decision, 'appeal', key, p, r.id);
      return { status: 'ok' };
    });
  });
}
