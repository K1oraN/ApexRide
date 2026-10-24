import type { Pool, PoolClient } from 'pg';
import type { FastifyRequest } from 'fastify';
import type { Config } from '../../config/env.js';
import { createPrincipal } from '../auth/session.js';
import { digest } from '../auth/security.js';
import { AuthError } from '../auth/validation.js';
export type Db = Pool | PoolClient;
export type Operator = {
  id: string;
  sessionId: string;
  permissions: string[];
  roles: string[];
};
export async function permissions(db: Db, user: string) {
  const rows = (
    await db.query(
      `SELECT DISTINCT r.code,p.permission_code FROM admin_user_roles ur JOIN users au ON au.id=ur.user_id AND au.account_status='active' AND au.email_verified_at IS NOT NULL JOIN admin_roles r ON r.code=ur.role_code AND r.enabled JOIN admin_role_permissions p ON p.role_code=r.code WHERE ur.user_id=$1 AND ur.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM moderation_sanctions ax WHERE ax.user_id=ur.user_id AND ax.scope='account' AND ax.revoked_at IS NULL AND ax.begins_at<=now() AND (ax.expires_at IS NULL OR ax.expires_at>now()))`,
      [user],
    )
  ).rows;
  return {
    roles: [...new Set(rows.map((r) => r.code as string))],
    permissions: [...new Set(rows.map((r) => r.permission_code as string))],
  };
}
export async function audit(
  db: Db,
  actor: string | null,
  action: string,
  type: string,
  target: string,
  permission: string,
  correlation: string,
  outcome = 'allowed',
  reason = 'operator_decision',
  explanation?: string,
) {
  if (explanation && actor)
    await db.query(
      'INSERT INTO admin_decision_notes(actor_id,action,resource_type,resource_id,explanation) VALUES($1,$2,$3,$4,$5)',
      [actor, action, type, target, explanation],
    );
  // Audit stores codes only. Human explanations stay in the separately protected decision record.
  await db.query(
    `INSERT INTO admin_audit_logs(actor_id,action,resource_type,resource_id,permission_used,correlation_id,outcome,reason_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actor, action, type, target, permission, correlation, outcome, reason],
  );
}
export async function rate(db: Db, key: string, max = 120, minutes = 1) {
  const r = await db.query(
    `INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+$2*interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+$2*interval '1 minute' ELSE auth_rate_limits.expires_at END RETURNING attempts`,
    [digest('admin:' + key), minutes],
  );
  if (r.rows[0].attempts > max)
    throw new AuthError(429, 'Limite administrativo atingido. Aguarde.');
}
export function adminPrincipal(config: Config, db: () => Pool) {
  const principal = createPrincipal(config, db);
  return async (
    req: FastifyRequest,
    permission?: string,
    recent = false,
  ): Promise<Operator> => {
    const { user, raw } = await principal(
      req,
      !['GET', 'HEAD'].includes(req.method),
    );
    await rate(db(), user.id);
    const rights = await permissions(db(), user.id);
    if (
      !rights.roles.length ||
      (permission && !rights.permissions.includes(permission))
    ) {
      await audit(
        db(),
        user.id,
        'access_denied',
        'administration',
        'access',
        permission ?? 'admin.access',
        req.id,
        'denied',
        'permission_denied',
      );
      throw new AuthError(
        403,
        'Sem permissão para esta operação administrativa.',
      );
    }
    const s = (
      await db().query('SELECT id FROM user_sessions WHERE secret_hash=$1', [
        digest(raw),
      ])
    ).rows[0];
    if (permission) {
      const ok = await db().query(
        `SELECT session_id FROM admin_sessions WHERE session_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() AND ($3::boolean=false OR verified_at>now()-interval '5 minutes')`,
        [s.id, user.id, recent],
      );
      if (!ok.rowCount) {
        await audit(
          db(),
          user.id,
          'access_denied',
          'administration',
          'session',
          permission,
          req.id,
          'denied',
          recent ? 'recent_auth_required' : 'mfa_required',
        );
        throw new AuthError(
          403,
          recent
            ? 'Reautentique com senha e MFA: ação crítica exige autenticação nos últimos cinco minutos.'
            : 'Complete a autenticação reforçada para abrir o painel.',
        );
      }
    }
    return { id: user.id, sessionId: s.id, ...rights };
  };
}
export async function revalidate(db: Db, op: Operator, permission: string) {
  const rights = await permissions(db, op.id);
  const ok = await db.query(
    `SELECT 1 FROM admin_sessions a JOIN user_sessions s ON s.id=a.session_id JOIN users u ON u.id=a.user_id WHERE a.session_id=$1 AND a.revoked_at IS NULL AND a.expires_at>now() AND s.revoked_at IS NULL AND s.expires_at>now() AND u.account_status='active' AND NOT EXISTS(SELECT 1 FROM moderation_sanctions x WHERE x.user_id=u.id AND x.scope='account' AND x.revoked_at IS NULL AND x.begins_at<=now() AND (x.expires_at IS NULL OR x.expires_at>now()))`,
    [op.sessionId],
  );
  if (!ok.rowCount || !rights.permissions.includes(permission))
    throw new AuthError(403, 'Acesso administrativo revogado.');
}
