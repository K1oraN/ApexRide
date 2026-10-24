import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import { verifyPassword, digest } from '../auth/security.js';
import { AuthError } from '../auth/validation.js';
import { transaction } from '../groups/store.js';
import { adminPrincipal, audit, rate } from './policy.js';
import { authenticator, counter, decryptSecret, encryptSecret } from './mfa.js';
import { fields, text } from './validation.js';
function password(value: unknown) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128)
    throw new AuthError(400, 'Senha inválida.');
  return value;
}
export function registerAdminAuth(
  app: FastifyInstance,
  db: () => Pool,
  config: Config,
) {
  const principal = adminPrincipal(config, db);
  app.get('/admin/access', async (req) => {
    const op = await principal(req);
    const mfa = (
      await db().query('SELECT confirmed_at FROM admin_mfa WHERE user_id=$1', [
        op.id,
      ])
    ).rows[0];
    const active = await db().query(
      'SELECT 1 FROM admin_sessions WHERE session_id=$1 AND revoked_at IS NULL AND expires_at>now()',
      [op.sessionId],
    );
    return {
      status: 'ok',
      id: op.id,
      permissions: op.permissions,
      roles: op.roles,
      mfaEnrolled: !!mfa?.confirmed_at,
      verified: !!active.rowCount,
    };
  });
  app.post('/admin/mfa/enroll', async (req) => {
    const op = await principal(req),
      b = fields(req.body, ['password']);
    await rate(db(), 'mfa:' + op.id, 5, 15);
    const u = (
      await db().query(
        'SELECT password_hash,email_verified_at FROM users WHERE id=$1',
        [op.id],
      )
    ).rows[0];
    if (
      !u.email_verified_at ||
      !(await verifyPassword(password(b.password), u.password_hash))
    )
      throw new AuthError(
        403,
        'Identidade verificada e senha atual necessárias.',
      );
    const t = authenticator(undefined, op.id);
    const result = await db().query(
      `INSERT INTO admin_mfa(user_id,encrypted_secret) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,last_counter=-1,enrollment_expires_at=now()+interval '10 minutes' WHERE admin_mfa.confirmed_at IS NULL RETURNING user_id`,
      [op.id, encryptSecret(t.secret.base32, config.adminMfaKey, op.id)],
    );
    if (!result.rowCount)
      throw new AuthError(
        409,
        'Autenticador já confirmado. Utilize o procedimento de recuperação.',
      );
    await audit(
      db(),
      op.id,
      'mfa_enrollment',
      'operator',
      op.id,
      'admin.access',
      req.id,
    );
    return { status: 'ok', secret: t.secret.base32, uri: t.toString() };
  });
  app.post('/admin/mfa/verify', async (req) => {
    const op = await principal(req),
      b = fields(req.body, ['password', 'code', 'recoveryCode']);
    await rate(db(), 'mfa:' + op.id, 5, 15);
    const u = (
      await db().query(
        'SELECT password_hash,email_verified_at FROM users WHERE id=$1',
        [op.id],
      )
    ).rows[0];
    if (
      !u.email_verified_at ||
      !(await verifyPassword(password(b.password), u.password_hash))
    ) {
      await audit(
        db(),
        op.id,
        'mfa_denied',
        'operator',
        op.id,
        'admin.access',
        req.id,
        'denied',
        'credentials_invalid',
      );
      throw new AuthError(403, 'Autenticação reforçada recusada.');
    }
    // Commit rejected attempts separately from the transaction to preserve evidence.
    const result = await transaction(db(), [op.id], async (c) => {
      const m = (
        await c.query('SELECT * FROM admin_mfa WHERE user_id=$1 FOR UPDATE', [
          op.id,
        ])
      ).rows[0];
      if (
        !m ||
        (!m.confirmed_at && m.enrollment_expires_at.getTime() <= Date.now())
      )
        return null;
      let accepted = false;
      if (b.recoveryCode !== undefined && m.confirmed_at) {
        const used = await c.query(
          'UPDATE admin_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING code_hash',
          [op.id, digest(text(b.recoveryCode, 20, 100))],
        );
        accepted = !!used.rowCount;
      } else {
        const n = counter(
          decryptSecret(m.encrypted_secret, config.adminMfaKey, op.id),
          b.code,
          Number(m.last_counter),
        );
        if (n !== null) {
          accepted = true;
          await c.query(
            'UPDATE admin_mfa SET last_counter=$2,confirmed_at=COALESCE(confirmed_at,now()) WHERE user_id=$1',
            [op.id, n],
          );
        }
      }
      if (!accepted) return null;
      const recoveryCodes: string[] = [];
      if (!m.confirmed_at)
        for (let i = 0; i < 8; i++) {
          const code = randomBytes(20).toString('hex');
          recoveryCodes.push(code);
          await c.query(
            'INSERT INTO admin_recovery_codes(user_id,code_hash) VALUES($1,$2)',
            [op.id, digest(code)],
          );
        }
      await c.query(
        `INSERT INTO admin_sessions(session_id,user_id) VALUES($1,$2) ON CONFLICT(session_id) DO UPDATE SET verified_at=now(),expires_at=now()+interval '30 minutes',revoked_at=NULL`,
        [op.sessionId, op.id],
      );
      await audit(
        c,
        op.id,
        b.recoveryCode ? 'mfa_recovery' : 'mfa_verified',
        'operator',
        op.id,
        'admin.access',
        req.id,
      );
      return { status: 'ok', recoveryCodes };
    });
    if (!result) {
      await audit(
        db(),
        op.id,
        'mfa_denied',
        'operator',
        op.id,
        'admin.access',
        req.id,
        'denied',
        'code_invalid',
      );
      throw new AuthError(403, 'Código inválido, reutilizado ou expirado.');
    }
    return result;
  });
  app.post('/admin/logout', async (req) => {
    const op = await principal(req);
    await transaction(db(), [op.id], async (c) => {
      await c.query(
        'UPDATE admin_sessions SET revoked_at=now() WHERE session_id=$1',
        [op.sessionId],
      );
      await audit(
        c,
        op.id,
        'admin_logout',
        'session',
        op.sessionId,
        'admin.access',
        req.id,
      );
    });
    return { status: 'ok' };
  });
}
