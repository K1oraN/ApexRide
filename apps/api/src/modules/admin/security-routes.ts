import { randomUUID } from 'node:crypto';
import type { AdminContext } from './context.js';
import { AuthError } from '../auth/validation.js';
import { permissions } from './policy.js';
import { reconcileUser, reverseGrant } from '../gamification/engine.js';
import * as v from './validation.js';
export function registerSecurity(ctx: AdminContext) {
  const { app, db, principal, param, tx, audit } = ctx;
  app.get('/admin/roles', async (r) => {
    await principal(r, 'admin.roles.manage');
    return {
      items: (
        await db().query(
          'SELECT r.code,r.name,r.enabled,array_agg(p.permission_code ORDER BY p.permission_code) AS permissions FROM admin_roles r JOIN admin_role_permissions p ON p.role_code=r.code GROUP BY r.code ORDER BY r.code',
        )
      ).rows,
      permissions: (
        await db().query('SELECT code FROM admin_permissions ORDER BY code')
      ).rows,
    };
  });
  app.get('/admin/operators', async (r) => {
    await principal(r, 'admin.roles.manage');
    const q = v.page(r.query),
      rows = (
        await db().query(
          `SELECT u.id,u.username,u.display_name,array_agg(r.role_code) AS roles,(m.confirmed_at IS NOT NULL) AS mfa_enrolled FROM users u JOIN admin_user_roles r ON r.user_id=u.id AND r.revoked_at IS NULL LEFT JOIN admin_mfa m ON m.user_id=u.id GROUP BY u.id,m.confirmed_at ORDER BY u.id LIMIT 31 OFFSET $1`,
          [q.offset],
        )
      ).rows;
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.post('/admin/operators/:id/roles', async (r) => {
    const p = 'admin.roles.manage',
      op = await principal(r, p, true),
      key = param(r),
      b = v.fields(r.body, ['role', 'action', 'reason', 'operationId']);
    const role = v.text(b.role, 1, 60),
      action = v.choice(b.action, ['grant', 'revoke']),
      reason = v.text(b.reason),
      operation = v.id(b.operationId);
    if (key === op.id)
      throw new AuthError(403, 'Não altere seus próprios privilégios.');
    return tx(op, p, async (c) => {
      if (
        !(
          await c.query(
            "SELECT id FROM users WHERE id=$1 AND email_verified_at IS NOT NULL AND account_status='active'",
            [key],
          )
        ).rowCount
      )
        throw v.invalid('Conta ativa e verificada necessária.');
      if (
        !(
          await c.query(
            'SELECT code FROM admin_roles WHERE code=$1 AND enabled',
            [role],
          )
        ).rowCount
      )
        throw v.invalid('Papel inválido.');
      if (role === 'superadmin') {
        const request = randomUUID();
        await c.query(
          'INSERT INTO admin_action_approvals(id,requested_by,action_type,target_reference,payload,reason,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            request,
            op.id,
            action === 'grant' ? 'role_grant' : 'role_revoke',
            key,
            JSON.stringify({ role }),
            reason,
            operation,
          ],
        );
        await audit(
          c,
          op.id,
          'critical_role_requested',
          'approval',
          request,
          p,
          r.id,
        );
        return { status: 'pending_approval', id: request };
      }
      if (action === 'grant')
        await c.query(
          'INSERT INTO admin_user_roles(id,user_id,role_code,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,role_code) WHERE revoked_at IS NULL DO NOTHING',
          [randomUUID(), key, role, op.id],
        );
      else
        await c.query(
          'UPDATE admin_user_roles SET revoked_at=now() WHERE user_id=$1 AND role_code=$2 AND revoked_at IS NULL',
          [key, role],
        );
      await audit(
        c,
        op.id,
        'role_' + action,
        'operator',
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
  app.post('/admin/roles/:id/permissions', async (r) => {
    const p = 'admin.roles.manage',
      op = await principal(r, p, true),
      role = (r.params as { id: string }).id,
      b = v.fields(r.body, ['permissions', 'reason', 'operationId']);
    const reason = v.text(b.reason),
      operation = v.id(b.operationId);
    if (
      !Array.isArray(b.permissions) ||
      b.permissions.length < 1 ||
      b.permissions.length > 40 ||
      b.permissions.some((x) => typeof x !== 'string')
    )
      throw v.invalid();
    if (role === 'superadmin' || op.roles.includes(role))
      throw new AuthError(
        403,
        'Papel raiz e próprio papel não podem ser alterados.',
      );
    return tx(op, p, async (c) => {
      const codes = [...new Set(b.permissions as string[])];
      if (
        (
          await c.query(
            'SELECT code FROM admin_permissions WHERE code=ANY($1::text[])',
            [codes],
          )
        ).rowCount !== codes.length
      )
        throw v.invalid();
      if (
        !(await c.query('SELECT code FROM admin_roles WHERE code=$1', [role]))
          .rowCount
      )
        throw v.invalid();
      const request = randomUUID();
      await c.query(
        "INSERT INTO admin_action_approvals(id,requested_by,action_type,target_reference,payload,reason,operation_id) VALUES($1,$2,'role_permissions',$3,$4,$5,$6)",
        [
          request,
          op.id,
          role,
          JSON.stringify({ permissions: codes }),
          reason,
          operation,
        ],
      );
      await audit(
        c,
        op.id,
        'role_permissions_requested',
        'approval',
        request,
        p,
        r.id,
      );
      return { status: 'pending_approval', id: request };
    });
  });
  app.get('/admin/approvals', async (r) => {
    const op = await principal(r),
      allowed =
        op.permissions.includes('admin.roles.approve') ||
        op.permissions.includes('admin.xp.adjust');
    if (!allowed) throw new AuthError(403, 'Sem permissão.');
    // Explicitly require a verified session even though the queue spans two permissions.
    await principal(
      r,
      op.permissions.includes('admin.roles.approve')
        ? 'admin.roles.approve'
        : 'admin.xp.adjust',
    );
    const q = v.page(r.query),
      rows = (
        await db().query(
          `SELECT id,requested_by,action_type,target_reference,reason,status,expires_at,requested_at FROM admin_action_approvals WHERE (action_type='xp_reverse' AND $1 OR action_type<>'xp_reverse' AND $2) ORDER BY requested_at DESC,id LIMIT 31 OFFSET $3`,
          [
            op.permissions.includes('admin.xp.adjust'),
            op.permissions.includes('admin.roles.approve'),
            q.offset,
          ],
        )
      ).rows;
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.post('/admin/approvals/:id/review', async (r) => {
    const key = param(r),
      b = v.fields(r.body, ['decision', 'reason', 'confirm']),
      decision = v.choice(b.decision, ['approve', 'reject']),
      reason = v.text(b.reason);
    if (b.confirm !== 'CONFIRMAR') throw v.invalid('Digite CONFIRMAR.');
    const a = (
      await db().query(
        'SELECT action_type FROM admin_action_approvals WHERE id=$1',
        [key],
      )
    ).rows[0];
    if (!a) throw new AuthError(404, 'Aprovação inexistente.');
    const p =
        a.action_type === 'xp_reverse'
          ? 'admin.xp.adjust'
          : 'admin.roles.approve',
      op = await principal(r, p, true);
    return tx(op, p, async (c) => {
      const row = (
        await c.query(
          'SELECT * FROM admin_action_approvals WHERE id=$1 FOR UPDATE',
          [key],
        )
      ).rows[0];
      if (row.requested_by === op.id || row.target_reference === op.id)
        throw new AuthError(
          403,
          'Não é permitido aprovar a própria ação ou acesso.',
        );
      if (row.status !== 'pending' || row.expires_at.getTime() <= Date.now())
        throw new AuthError(409, 'Aprovação expirada ou já utilizada.');
      const requester = await permissions(c, row.requested_by),
        required =
          row.action_type === 'xp_reverse'
            ? 'admin.xp.adjust'
            : 'admin.roles.manage';
      if (!requester.permissions.includes(required))
        throw new AuthError(403, 'Solicitante perdeu a permissão.');
      if (decision === 'approve') {
        if (row.action_type === 'xp_reverse') {
          const payload = row.payload as {
            userId: string;
            ledgerId: string;
            occurrenceKey: string;
          };
          if (payload.userId === op.id)
            throw new AuthError(403, 'Não aprove correção do próprio XP.');
          await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
            payload.userId,
          ]);
          if (
            !(
              await c.query(
                "SELECT 1 FROM xp_ledger l WHERE l.id=$1 AND l.status='granted' AND NOT EXISTS(SELECT 1 FROM xp_ledger x WHERE x.reversal_of_id=l.id)",
                [payload.ledgerId],
              )
            ).rowCount
          )
            throw new AuthError(409, 'Concessão já corrigida.');
          await c.query(
            'INSERT INTO admin_xp_exclusions(user_id,occurrence_key,original_ledger_id,approval_id) VALUES($1,$2,$3,$4)',
            [payload.userId, payload.occurrenceKey, payload.ledgerId, key],
          );
          await reverseGrant(c, payload.ledgerId, row.reason, op.id);
          await reconcileUser(c, payload.userId, 100, op.id);
          await c.query(
            "INSERT INTO gamification_audit(user_id,actor,action,source_id,reason) VALUES($1,$2,'admin_reversal',$3,$4)",
            [payload.userId, op.id, payload.ledgerId, row.reason],
          );
        } else if (row.action_type === 'role_permissions') {
          const codes = row.payload.permissions as string[];
          if (
            op.roles.includes(row.target_reference) ||
            requester.roles.includes(row.target_reference) ||
            row.target_reference === 'superadmin'
          )
            throw new AuthError(
              403,
              'Não altere papéis de solicitante ou aprovador.',
            );
          await c.query(
            'DELETE FROM admin_role_permissions WHERE role_code=$1',
            [row.target_reference],
          );
          await c.query(
            'INSERT INTO admin_role_permissions(role_code,permission_code) SELECT $1,unnest($2::text[])',
            [row.target_reference, codes],
          );
          await c.query(
            'UPDATE admin_sessions SET revoked_at=now() WHERE user_id IN (SELECT user_id FROM admin_user_roles WHERE role_code=$1 AND revoked_at IS NULL)',
            [row.target_reference],
          );
        } else {
          const target = row.target_reference,
            role = row.payload.role;
          if (row.action_type === 'role_revoke') {
            const valid = await c.query(
              "SELECT DISTINCT u.user_id FROM admin_user_roles u JOIN users a ON a.id=u.user_id AND a.account_status='active' AND a.email_verified_at IS NOT NULL JOIN admin_mfa m ON m.user_id=u.user_id AND m.confirmed_at IS NOT NULL WHERE u.role_code='superadmin' AND u.revoked_at IS NULL AND u.user_id<>$1 AND NOT EXISTS(SELECT 1 FROM moderation_sanctions x WHERE x.user_id=u.user_id AND x.scope='account' AND x.revoked_at IS NULL AND (x.expires_at IS NULL OR x.expires_at>now()))",
              [target],
            );
            if (!valid.rowCount)
              throw new AuthError(
                409,
                'Não é permitido revogar o último superadministrador efetivo.',
              );
            await c.query(
              'UPDATE admin_user_roles SET revoked_at=now() WHERE user_id=$1 AND role_code=$2 AND revoked_at IS NULL',
              [target, role],
            );
          } else {
            if (
              !(
                await c.query(
                  "SELECT 1 FROM users WHERE id=$1 AND email_verified_at IS NOT NULL AND account_status='active'",
                  [target],
                )
              ).rowCount
            )
              throw v.invalid('Conta não elegível.');
            await c.query(
              'INSERT INTO admin_user_roles(id,user_id,role_code,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,role_code) WHERE revoked_at IS NULL DO NOTHING',
              [randomUUID(), target, role, row.requested_by],
            );
          }
        }
      }
      await c.query(
        'UPDATE admin_action_approvals SET status=$2,approved_by=$3,reviewed_at=now() WHERE id=$1',
        [key, decision === 'approve' ? 'executed' : 'rejected', op.id],
      );
      // Review explanation stays scoped to the approval workflow, never in the audit payload.
      await c.query(
        "UPDATE admin_action_approvals SET payload=payload||jsonb_build_object('reviewReason',$2::text) WHERE id=$1",
        [key, reason],
      );
      await audit(c, op.id, 'approval_' + decision, 'approval', key, p, r.id);
      return { status: 'ok' };
    });
  });
  app.get('/admin/audit', async (r) => {
    const p = 'admin.audit.read',
      op = await principal(r, p),
      q = v.page(r.query),
      rows = (
        await db().query(
          'SELECT id,actor_id,action,resource_type,resource_id,permission_used,outcome,reason_code,correlation_id,created_at,previous_hash,entry_hash FROM admin_audit_logs WHERE ($1::uuid IS NULL OR actor_id=$1) AND ($2::timestamptz IS NULL OR created_at>=$2) AND ($3::timestamptz IS NULL OR created_at<$3) ORDER BY id DESC LIMIT 31 OFFSET $4',
          [q.userId, q.from, q.to, q.offset],
        )
      ).rows;
    await audit(db(), op.id, 'audit_read', 'audit', 'page', p, r.id);
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.get('/admin/security/overview', async (r) => {
    await principal(r, 'admin.security.read');
    return {
      items: (
        await db().query(
          `SELECT action,outcome,count(*)::int AS count FROM admin_audit_logs WHERE created_at>now()-interval '24 hours' GROUP BY action,outcome ORDER BY count DESC LIMIT 30`,
        )
      ).rows,
      activeAdminSessions: (
        await db().query(
          'SELECT count(*)::int AS n FROM admin_sessions a JOIN user_sessions s ON s.id=a.session_id WHERE a.revoked_at IS NULL AND a.expires_at>now() AND s.revoked_at IS NULL AND s.expires_at>now()',
        )
      ).rows[0].n,
    };
  });
  app.post('/admin/security/revoke', async (r) => {
    const p = 'admin.sessions.revoke',
      op = await principal(r, p, true),
      b = v.fields(r.body, ['userId', 'reason']),
      key = v.id(b.userId);
    v.text(b.reason);
    return tx(op, p, async (c) => {
      await c.query(
        'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [key],
      );
      await c.query(
        'UPDATE admin_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [key],
      );
      await c.query('SELECT revoke_event_gps($1)', [key]);
      await audit(
        c,
        op.id,
        'sessions_revoked',
        'user',
        key,
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
