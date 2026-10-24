import { randomUUID } from 'node:crypto';
import type { AdminContext } from './context.js';
import { AuthError } from '../auth/validation.js';
import * as v from './validation.js';
import { permissions } from './policy.js';
const userFields = `u.id,u.display_name,u.username,u.created_at,u.account_status,(u.email_verified_at IS NOT NULL) AS verified,
 CASE WHEN u.account_status<>'active' THEN u.account_status
 WHEN EXISTS(SELECT 1 FROM moderation_sanctions x WHERE x.user_id=u.id AND x.scope='account' AND x.revoked_at IS NULL AND x.begins_at<=now() AND x.expires_at IS NULL) THEN 'suspended_indefinitely'
 WHEN EXISTS(SELECT 1 FROM moderation_sanctions x WHERE x.user_id=u.id AND x.scope='account' AND x.revoked_at IS NULL AND x.begins_at<=now() AND x.expires_at>now()) THEN 'suspended_temporarily'
 WHEN EXISTS(SELECT 1 FROM moderation_sanctions x WHERE x.user_id=u.id AND x.scope NOT IN ('none','account') AND x.revoked_at IS NULL AND x.begins_at<=now() AND (x.expires_at IS NULL OR x.expires_at>now())) THEN 'restricted'
 ELSE 'active' END AS effective_status`;
export function registerUsers(ctx: AdminContext) {
  const { app, db, principal, param, tx, audit } = ctx;
  app.get('/admin/users', async (r) => {
    const p = 'admin.users.read',
      op = await principal(r, p),
      q = v.page(r.query);
    const result = await db().query(
      `SELECT ${userFields},EXISTS(SELECT 1 FROM moderation_sanctions s WHERE s.user_id=u.id AND s.scope<>'none' AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now())) AS restricted FROM users u WHERE ($1='' OR lower(u.username) LIKE lower($1)||'%' OR lower(u.display_name) LIKE lower($1)||'%' OR u.id::text=$1) ORDER BY u.created_at DESC,u.id LIMIT 31 OFFSET $2`,
      [q.search, q.offset],
    );
    await audit(db(), op.id, 'users_read', 'users', 'page', p, r.id);
    return {
      items: result.rows.slice(0, 30),
      hasMore: result.rows.length > 30,
    };
  });
  app.get('/admin/users/:id', async (r) => {
    const p = 'admin.users.read',
      op = await principal(r, p),
      key = param(r),
      row = (
        await db().query(`SELECT ${userFields} FROM users u WHERE u.id=$1`, [
          key,
        ])
      ).rows[0];
    if (!row) throw new AuthError(404, 'Conta não encontrada.');
    await audit(db(), op.id, 'user_read', 'user', key, p, r.id);
    return {
      user: row,
      sanctions: (
        await db().query(
          'SELECT id,sanction_type,scope,reason,policy_code,begins_at,expires_at,revoked_at,applied_by FROM moderation_sanctions WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 30',
          [key],
        )
      ).rows,
    };
  });
  for (const action of ['warn', 'restrict', 'suspend'] as const)
    app.post(`/admin/users/:id/${action}`, async (r) => {
      const p =
          action === 'suspend' ? 'admin.users.suspend' : 'admin.users.restrict',
        op = await principal(r, p, action === 'suspend'),
        key = param(r),
        b = v.fields(r.body, [
          'reason',
          'policyCode',
          'scope',
          'expiresAt',
          'caseId',
          'operationId',
          'confirm',
        ]);
      const reason = v.text(b.reason, 5, 1000),
        policy = v.text(b.policyCode, 3, 80),
        operation = v.id(b.operationId),
        caseId = b.caseId == null ? null : v.id(b.caseId);
      const scope =
        action === 'warn'
          ? 'none'
          : action === 'suspend'
            ? 'account'
            : v.choice(b.scope, [
                'posts',
                'comments',
                'groups',
                'events',
                'rankings',
                'social_gps',
              ]);
      const expiry = b.expiresAt == null ? null : v.date(b.expiresAt);
      if (
        (action === 'restrict' && !expiry) ||
        (expiry &&
          (expiry.getTime() <= Date.now() ||
            expiry.getTime() > Date.now() + 365 * 86400000))
      )
        throw v.invalid('Prazo deve estar no futuro e dentro de um ano.');
      if (action === 'suspend' && b.confirm !== 'SUSPENDER')
        throw v.invalid('Confirme SUSPENDER.');
      if (op.id === key)
        throw new AuthError(403, 'Não aplique medidas à própria conta.');
      return tx(op, p, async (c) => {
        const existing = (
          await c.query(
            'SELECT user_id,applied_by,scope,reason,policy_code,case_id,expires_at FROM moderation_sanctions WHERE operation_id=$1',
            [operation],
          )
        ).rows[0];
        if (existing) {
          if (
            existing.user_id !== key ||
            existing.applied_by !== op.id ||
            existing.scope !== scope ||
            existing.reason !== reason ||
            existing.policy_code !== policy ||
            existing.case_id !== caseId ||
            (existing.expires_at?.getTime() ?? null) !==
              (expiry?.getTime() ?? null)
          )
            throw new AuthError(409, 'Operação já utilizada.');
          return { status: 'ok', repeated: true };
        }
        const target = (
          await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [key])
        ).rows[0];
        if (!target) throw new AuthError(404, 'Conta inexistente.');
        const roles = await permissions(c, key);
        if (roles.roles.length)
          throw new AuthError(
            403,
            'Medidas em operadores exigem revogação dos papéis antes da análise da conta.',
          );
        if (op.roles.every((x) => !['superadmin', 'platform'].includes(x))) {
          if (!caseId)
            throw new AuthError(403, 'Moderador precisa de caso atribuído.');
          const cas = (
            await c.query(
              `SELECT 1 FROM moderation_cases mc WHERE mc.id=$1 AND mc.assigned_to=$2 AND mc.status IN ('reviewing','reopened','waiting') AND ((mc.target_type IN ('profile','group_member') AND mc.target_id=$3) OR (mc.target_type='post' AND EXISTS(SELECT 1 FROM social_posts s WHERE s.id=mc.target_id AND s.author_id=$3)) OR (mc.target_type='comment' AND EXISTS(SELECT 1 FROM social_post_comments s WHERE s.id=mc.target_id AND s.author_id=$3)))`,
              [caseId, op.id, key],
            )
          ).rowCount;
          if (
            !cas ||
            !['none', 'posts', 'comments'].includes(scope) ||
            (expiry && expiry.getTime() > Date.now() + 7 * 86400000)
          )
            throw new AuthError(
              403,
              'Medida fora da competência do moderador.',
            );
        }
        await c.query(
          'INSERT INTO moderation_sanctions(id,user_id,case_id,sanction_type,scope,reason,policy_code,applied_by,expires_at,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            randomUUID(),
            key,
            caseId,
            action === 'warn'
              ? 'warning'
              : action === 'suspend'
                ? 'suspension'
                : 'restriction',
            scope,
            reason,
            policy,
            op.id,
            expiry,
            operation,
          ],
        );
        await audit(c, op.id, 'user_' + action, 'user', key, p, r.id);
        return { status: 'ok' };
      });
    });
  app.post('/admin/users/:id/restore', async (r) => {
    const p = 'admin.users.suspend',
      op = await principal(r, p, true),
      key = param(r),
      b = v.fields(r.body, ['sanctionId', 'reason']);
    v.text(b.reason);
    const sanction = v.id(b.sanctionId);
    return tx(op, p, async (c) => {
      const result = await c.query(
        'UPDATE moderation_sanctions SET revoked_at=now(),revoked_by=$3 WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id',
        [sanction, key, op.id],
      );
      if (!result.rowCount)
        throw new AuthError(409, 'Medida inexistente ou já revertida.');
      await audit(
        c,
        op.id,
        'sanction_restored',
        'sanction',
        sanction,
        p,
        r.id,
        'allowed',
        'operator_decision',
        v.text(b.reason),
      );
      return { status: 'ok' };
    });
  });
}
