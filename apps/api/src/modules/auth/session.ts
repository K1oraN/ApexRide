import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import * as v from './validation.js';
import { digest, csrfFor, equal } from './security.js';
import { enforceSanctions } from '../admin/sanctions.js';

export interface UserRow {
  admin_access: boolean;
  speed_mode: 'assisted' | 'pure';
  id: string;
  display_name: string;
  username: string;
  email: string;
  password_hash: string;
  account_status: string;
  email_verified_at: Date | null;
  created_at: Date;
  biography: string;
  city: string;
  state: string;
  avatar_ref: string | null;
  profile_visibility: 'public' | 'private';
  activity_visibility: 'public' | 'private';
}
export const selectUser = `SELECT u.*, EXISTS(SELECT 1 FROM admin_user_roles ar JOIN admin_roles role ON role.code=ar.role_code AND role.enabled WHERE ar.user_id=u.id AND ar.revoked_at IS NULL) AS admin_access, p.biography,p.city,p.state,p.avatar_ref,
  ps.profile_visibility,ps.activity_visibility FROM users u
  JOIN profiles p ON p.user_id=u.id JOIN privacy_settings ps ON ps.user_id=u.id`;

export function sessionGuard(config: Config) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (
      request.headers['x-apex-request'] !== '1' ||
      (origin &&
        ![...config.corsOrigins, config.auth.webOrigin].includes(origin))
    )
      throw new v.AuthError(403, 'Origem da requisição não autorizada.');
  };
}

export function createPrincipal(config: Config, db: () => Pool) {
  const cookieName =
    config.nodeEnv === 'production' ? '__Host-apex_session' : 'apex_session';
  return async function principal(request: FastifyRequest, modify = false) {
    const raw = request.cookies[cookieName];
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
      throw new v.AuthError(401, 'Entre na sua conta para continuar.');
    const result = await db().query(
      `${selectUser} JOIN user_sessions s ON s.user_id=u.id
      WHERE s.secret_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.account_status='active'
      AND ($2::boolean=false OR u.email_verified_at IS NOT NULL)`,
      [digest(raw), config.auth.emailVerificationRequired],
    );
    const user = result.rows[0] as UserRow | undefined;
    if (!user)
      throw new v.AuthError(
        401,
        'Sessão encerrada ou expirada. Entre novamente.',
      );
    if (
      modify &&
      (typeof request.headers['x-csrf-token'] !== 'string' ||
        !equal(request.headers['x-csrf-token'], csrfFor(raw)))
    )
      throw new v.AuthError(
        403,
        'Não foi possível validar a requisição. Recarregue a página.',
      );
    await db().query(
      "UPDATE user_sessions SET last_used_at=now() WHERE secret_hash=$1 AND last_used_at<now()-interval '5 minutes'",
      [digest(raw)],
    );
    if (
      !request.url.startsWith('/api/moderation/') &&
      !request.url.startsWith('/api/privacy/') &&
      request.url.split('?')[0] !== '/api/auth/me'
    )
      await enforceSanctions(db(), user.id, request);
    return { user, raw };
  };
}
