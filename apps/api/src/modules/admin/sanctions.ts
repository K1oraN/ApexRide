import type { Pool } from 'pg';
import type { FastifyRequest } from 'fastify';
import { AuthError } from '../auth/validation.js';
export function activeSanction(user: string, scope: string) {
  return `EXISTS(SELECT 1 FROM moderation_sanctions ax WHERE ax.user_id=${user} AND ax.scope IN ('account','${scope}') AND ax.revoked_at IS NULL AND ax.begins_at<=now() AND (ax.expires_at IS NULL OR ax.expires_at>now()))`;
}
export async function enforceSanctions(
  db: Pool,
  user: string,
  req: FastifyRequest,
) {
  const path = req.routeOptions.url ?? req.url.split('?')[0]!,
    write = !['GET', 'HEAD'].includes(req.method);
  const scopes = ['account'];
  if (write && !path.includes('/admin/')) {
    if (/\/posts(?:\/[^/]+)?$/.test(path) || path === '/api/social/media')
      scopes.push('posts');
    if (/\/comments/.test(path)) scopes.push('comments');
    if (path === '/api/groups') scopes.push('groups');
    if (/\/events/.test(path) && !path.endsWith('/stop')) scopes.push('events');
    if (/\/live\/(start|position)$/.test(path)) scopes.push('social_gps');
  }
  const denied = await db.query(
    `SELECT scope FROM moderation_sanctions WHERE user_id=$1 AND scope=ANY($2::text[]) AND revoked_at IS NULL AND begins_at<=now() AND (expires_at IS NULL OR expires_at>now()) LIMIT 1`,
    [user, scopes],
  );
  if (denied.rowCount)
    throw new AuthError(
      403,
      'Esta funcionalidade está restrita. Consulte suas medidas e opções de recurso.',
    );
}
