import type { AdminContext } from './context.js';
import * as v from './validation.js';
import { AuthError } from '../auth/validation.js';
import { reconcileUser } from '../gamification/engine.js';
import { decision } from './decision.js';
export function registerRankingIntegrity(ctx: AdminContext) {
  const { app, db, principal, param, tx, audit } = ctx;
  app.post('/admin/gamification/anomalies/:id/review', async (r) => {
    const p = 'admin.xp.review',
      op = await principal(r, p),
      key = v.text((r.params as { id: string }).id, 1, 20),
      b = v.fields(r.body, ['status', 'reason']),
      status = v.choice(b.status, ['resolved', 'rejected']),
      reason = v.text(b.reason);
    if (!/^\d+$/.test(key)) throw v.invalid();
    return tx(op, p, async (c) => {
      const row = (
        await c.query(
          "UPDATE gamification_reviews SET status=$2,actor=$3,resolved_at=now() WHERE id=$1 AND status='pending' RETURNING user_id",
          [key, status, op.id],
        )
      ).rows[0];
      if (!row) throw new AuthError(409, 'Anomalia alterada ou encerrada.');
      await c.query(
        'INSERT INTO gamification_audit(user_id,actor,action,source_id,reason) VALUES($1,$2,$3,$4,$5)',
        [row.user_id, op.id, 'review_' + status, key, reason],
      );
      await audit(
        c,
        op.id,
        'anomaly_' + status,
        'gamification_review',
        key,
        p,
        r.id,
      );
      return { status: 'ok' };
    });
  });
  app.get('/admin/rankings/entries', async (r) => {
    await principal(r, 'admin.rankings.manage');
    const q = v.fields(r.query ?? {}, ['season', 'page']);
    const season = v.text(q.season, 7, 7);
    if (!/^\d{4}-\d{2}$/.test(season)) throw v.invalid();
    const page = v.page({ page: q.page });
    const rows = (
      await db().query(
        `SELECT s.user_id,u.username,s.season_id,sum(s.score)::text AS score,(x.user_id IS NOT NULL) AS suspended FROM leaderboard_scores s JOIN users u ON u.id=s.user_id JOIN privacy_settings ps ON ps.user_id=u.id AND ps.profile_visibility='public' JOIN leaderboard_participation p ON p.user_id=u.id AND p.opted_in LEFT JOIN admin_ranking_entries x ON x.user_id=u.id AND x.season_id=s.season_id WHERE s.season_id=$1 AND s.kind='xp' GROUP BY s.user_id,u.username,s.season_id,x.user_id ORDER BY s.user_id LIMIT 31 OFFSET $2`,
        [season, page.offset],
      )
    ).rows;
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.post('/admin/rankings/entries/:id/decision', async (r) => {
    const p = 'admin.rankings.manage',
      op = await principal(r, p, true),
      key = param(r),
      b = v.fields(r.body, ['season', 'action', 'reason']),
      season = v.text(b.season, 7, 7),
      action = v.choice(b.action, ['suspend', 'restore', 'reprocess']),
      reason = v.text(b.reason);
    if (!/^\d{4}-\d{2}$/.test(season) || key === op.id)
      throw v.invalid('Conta ou temporada inválida.');
    return tx(op, p, async (c) => {
      const s = (
        await c.query('SELECT status FROM leaderboard_seasons WHERE id=$1', [
          season,
        ])
      ).rows[0];
      if (!s || s.status === 'scheduled')
        throw new AuthError(409, 'Temporada indisponível.');
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [key]);
      if (action === 'suspend') {
        if (
          !(
            await c.query(
              'SELECT 1 FROM leaderboard_scores WHERE user_id=$1 AND season_id=$2',
              [key, season],
            )
          ).rowCount
        )
          throw new AuthError(404, 'Entrada inexistente.');
        await c.query(
          'INSERT INTO admin_ranking_entries(user_id,season_id,reason,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,season_id) DO UPDATE SET reason=$3,actor_id=$4',
          [key, season, reason, op.id],
        );
        await decision(c, op.id, 'profile', key, 'ranking_suspended', reason, {
          kind: 'ranking',
          userId: key,
          season,
        });
      } else if (action === 'restore')
        await c.query(
          'DELETE FROM admin_ranking_entries WHERE user_id=$1 AND season_id=$2',
          [key, season],
        );
      else await reconcileUser(c, key, 100, op.id);
      if (['closed', 'archived'].includes(s.status))
        await c.query(
          'UPDATE leaderboard_seasons SET revision=revision+1 WHERE id=$1',
          [season],
        );
      await audit(
        c,
        op.id,
        'ranking_' + action,
        'user',
        key,
        p,
        r.id,
        'allowed',
        'operator_decision',
        reason,
      );
      return { status: 'ok' };
    });
  });
}
