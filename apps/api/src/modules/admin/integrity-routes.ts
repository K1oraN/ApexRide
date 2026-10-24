import { randomUUID } from 'node:crypto';
import type { AdminContext } from './context.js';
import * as v from './validation.js';
import { AuthError } from '../auth/validation.js';
import { reconcileUser } from '../gamification/engine.js';
import { decision } from './decision.js';
export function registerIntegrity(ctx: AdminContext) {
  const { app, db, principal, param, tx, audit } = ctx;
  app.get('/admin/gamification/anomalies', async (r) => {
    await principal(r, 'admin.xp.review');
    const q = v.page(r.query),
      rows = (
        await db().query(
          "SELECT id,user_id,source_type,source_id,reason,status,created_at FROM gamification_reviews WHERE ($1='' OR status=$1) ORDER BY created_at,id LIMIT 31 OFFSET $2",
          [q.status, q.offset],
        )
      ).rows;
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.get('/admin/gamification/users/:id/ledger', async (r) => {
    const p = 'admin.xp.review',
      op = await principal(r, p),
      key = param(r),
      q = v.page(r.query);
    const rows = (
      await db().query(
        'SELECT id,rule_code,rule_version,source_type,source_id,xp_delta,status,reason,reversal_of_id,season_id,actor,created_at FROM xp_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 31 OFFSET $2',
        [key, q.offset],
      )
    ).rows;
    await audit(db(), op.id, 'xp_ledger_read', 'user', key, p, r.id);
    return {
      items: rows.slice(0, 30),
      hasMore: rows.length > 30,
      balance: (
        await db().query(
          'SELECT COALESCE(sum(xp_delta),0)::text AS xp FROM xp_ledger WHERE user_id=$1',
          [key],
        )
      ).rows[0].xp,
    };
  });
  app.post('/admin/gamification/adjustments/request', async (r) => {
    const p = 'admin.xp.adjust',
      op = await principal(r, p, true),
      b = v.fields(r.body, ['ledgerId', 'reason', 'operationId']);
    const ledger = v.text(b.ledgerId, 1, 20),
      reason = v.text(b.reason, 5, 1000),
      operation = v.id(b.operationId);
    if (!/^\d+$/.test(ledger)) throw v.invalid();
    return tx(op, p, async (c) => {
      const grant = (
        await c.query(
          "SELECT id,user_id,occurrence_key,xp_delta FROM xp_ledger WHERE id=$1 AND status='granted' AND NOT EXISTS(SELECT 1 FROM xp_ledger rev WHERE rev.reversal_of_id=xp_ledger.id)",
          [ledger],
        )
      ).rows[0];
      if (!grant)
        throw new AuthError(409, 'Concessão inexistente ou já corrigida.');
      if (grant.user_id === op.id)
        throw new AuthError(403, 'Não solicite correção no próprio XP.');
      const request = randomUUID();
      const inserted = await c.query(
        "INSERT INTO admin_action_approvals(id,requested_by,action_type,target_reference,payload,reason,operation_id) VALUES($1,$2,'xp_reverse',$3,$4,$5,$6) ON CONFLICT(operation_id) DO NOTHING RETURNING id",
        [
          request,
          op.id,
          ledger,
          JSON.stringify({
            ledgerId: ledger,
            userId: grant.user_id,
            occurrenceKey: grant.occurrence_key,
          }),
          reason,
          operation,
        ],
      );
      if (!inserted.rowCount)
        throw new AuthError(409, 'Solicitação já registrada.');
      await audit(
        c,
        op.id,
        'xp_correction_requested',
        'approval',
        request,
        p,
        r.id,
      );
      return { status: 'ok', id: request };
    });
  });
  app.get('/admin/rankings', async (r) => {
    await principal(r, 'admin.rankings.manage');
    return {
      items: (
        await db().query(
          'SELECT id,name,status,starts_at,ends_at,revision FROM leaderboard_seasons ORDER BY starts_at DESC LIMIT 30',
        )
      ).rows,
    };
  });
  app.post('/admin/rankings/results/:id/decision', async (r) => {
    const p = 'admin.rankings.manage',
      op = await principal(r, p, true),
      key = param(r),
      b = v.fields(r.body, ['state', 'reason']),
      state = v.choice(b.state, ['review', 'invalid', 'restore']),
      reason = v.text(b.reason);
    return tx(op, p, async (c) => {
      const row = (
        await c.query(
          "SELECT f.user_id FROM gamification_ride_facts f JOIN rides r ON r.id=f.ride_id WHERE f.ride_id=$1 AND r.mode='pista'",
          [key],
        )
      ).rows[0];
      if (!row) throw new AuthError(404, 'Resultado indisponível.');
      if (row.user_id === op.id)
        throw new AuthError(403, 'Outro analista deve revisar seu resultado.');
      if (state === 'restore')
        await c.query('DELETE FROM admin_result_states WHERE ride_id=$1', [
          key,
        ]);
      else
        await c.query(
          'INSERT INTO admin_result_states(ride_id,state,reason,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(ride_id) DO UPDATE SET state=$2,reason=$3,actor_id=$4',
          [key, state, reason, op.id],
        );
      await audit(
        c,
        op.id,
        'circuit_result_' + state,
        'ride',
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
  app.get('/admin/gamification/results', async (r) => {
    await principal(r, 'admin.rankings.manage');
    const q = v.page(r.query),
      rows = (
        await db().query(
          `SELECT f.ride_id,f.user_id,r.route_id,f.state,f.reason,f.circuit,(SELECT jsonb_agg(jsonb_build_object('lap',l.lap_number,'estimatedSeconds',round(l.duration_ms/1000.0,1),'accuracy',l.quality->>'accuracy') ORDER BY l.lap_number) FROM ride_laps l WHERE l.ride_id=r.id) AS estimated_laps,ax.state AS review_state FROM gamification_ride_facts f JOIN rides r ON r.id=f.ride_id LEFT JOIN admin_result_states ax ON ax.ride_id=f.ride_id WHERE r.mode='pista' ORDER BY r.created_at DESC,r.id LIMIT 31 OFFSET $1`,
          [q.offset],
        )
      ).rows;
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.get('/admin/gamification/users/:id/achievements', async (r) => {
    const p = 'admin.xp.review',
      op = await principal(r, p),
      key = param(r);
    await audit(db(), op.id, 'achievements_read', 'user', key, p, r.id);
    return {
      items: (
        await db().query(
          'SELECT a.achievement_code,a.current_value,a.status,a.awarded_version,x.created_at AS suspended_at FROM user_achievements a LEFT JOIN admin_achievement_states x ON x.user_id=a.user_id AND x.achievement_code=a.achievement_code WHERE a.user_id=$1 ORDER BY a.achievement_code LIMIT 100',
          [key],
        )
      ).rows,
    };
  });
  app.post('/admin/gamification/users/:id/achievements', async (r) => {
    const p = 'admin.xp.adjust',
      op = await principal(r, p, true),
      key = param(r),
      b = v.fields(r.body, ['code', 'action', 'reason']),
      code = v.text(b.code, 1, 80),
      action = v.choice(b.action, ['revoke', 'restore', 'reprocess']),
      reason = v.text(b.reason);
    if (key === op.id)
      throw new AuthError(403, 'Não revise suas próprias conquistas.');
    return tx(op, p, async (c) => {
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [key]);
      if (
        !(
          await c.query(
            'SELECT 1 FROM user_achievements WHERE user_id=$1 AND achievement_code=$2',
            [key, code],
          )
        ).rowCount
      )
        throw new AuthError(404, 'Conquista inexistente.');
      if (action === 'revoke') {
        await decision(
          c,
          op.id,
          'profile',
          key,
          'achievement_revoked',
          reason,
          { kind: 'achievement', userId: key, code },
        );
        await c.query(
          'INSERT INTO admin_achievement_states(user_id,achievement_code,reason,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,achievement_code) DO UPDATE SET reason=$3,actor_id=$4',
          [key, code, reason, op.id],
        );
      } else {
        await c.query(
          'DELETE FROM admin_achievement_states WHERE user_id=$1 AND achievement_code=$2',
          [key, code],
        );
        await reconcileUser(c, key, 100, op.id);
      }
      await audit(
        c,
        op.id,
        'achievement_' + action,
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
