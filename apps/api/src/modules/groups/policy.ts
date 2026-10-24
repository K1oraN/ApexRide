import type { Pool, PoolClient } from 'pg';
import { AuthError } from '../auth/validation.js';
import { notBlocked } from '../social/block-policy.js';
import { unavailable } from '../social/validation.js';

export type Role = 'owner' | 'admin' | 'moderator' | 'member';
export const permissions = {
  edit: ['owner', 'admin'],
  privacy: ['owner'],
  approve: ['owner', 'admin'],
  invite: ['owner', 'admin'],
  moderate: ['owner', 'admin', 'moderator'],
  remove: ['owner', 'admin', 'moderator'],
  role: ['owner'],
  transfer: ['owner'],
  delete: ['owner'],
  audit: ['owner', 'admin'],
} satisfies Record<string, Role[]>;
export type Action = keyof typeof permissions;
export const activeMember = (g = 'g', viewer = '$1') =>
  `EXISTS(SELECT 1 FROM group_memberships gm WHERE gm.group_id=${g}.id AND gm.user_id=${viewer}::uuid AND gm.status='active')`;
export const groupEligible = (g = 'g', viewer = '$1') =>
  `${g}.status<>'deleted' AND EXISTS(SELECT 1 FROM users go WHERE go.id=${g}.owner_id AND go.account_status='active') AND ${notBlocked(`${g}.owner_id`, viewer)} AND NOT EXISTS(SELECT 1 FROM group_memberships gb WHERE gb.group_id=${g}.id AND gb.user_id=${viewer}::uuid AND gb.status='banned')`;
export const groupVisible = (g = 'g', viewer = '$1') =>
  `${groupEligible(g, viewer)} AND (${g}.discovery_mode='listed' OR ${activeMember(g, viewer)} OR EXISTS(SELECT 1 FROM group_memberships gp WHERE gp.group_id=${g}.id AND gp.user_id=${viewer}::uuid AND gp.status='pending'))`;
export const groupPostAccess = `EXISTS(SELECT 1 FROM groups g WHERE g.id=s.group_id AND ${groupEligible()} AND (${activeMember()} OR (g.privacy_type='public' AND NOT s.group_private)))`;
export interface GroupContext {
  id: string;
  owner_id: string;
  privacy_type: 'public' | 'private';
  discovery_mode: string;
  join_policy: string;
  posting_policy: string;
  members_can_invite: boolean;
  status: string;
  rules_version: number;
  member_status: string | null;
  role: Role | null;
  suspended: boolean;
  accepted_rules_version: number | null;
}
export async function context(
  c: Pool | PoolClient,
  user: string,
  id: string,
  lock = false,
  invitation = false,
) {
  if (lock)
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,19))', [
      id,
    ]);
  const row = (
    await c.query<GroupContext>(
      `SELECT g.*,m.status AS member_status,m.role,m.accepted_rules_version,
    EXISTS(SELECT 1 FROM group_member_restrictions x WHERE x.group_id=g.id AND x.user_id=$1 AND x.restriction_type='suspend' AND x.revoked_at IS NULL AND (x.expires_at IS NULL OR x.expires_at>now())) AS suspended
    FROM groups g LEFT JOIN group_memberships m ON m.group_id=g.id AND m.user_id=$1 WHERE g.id=$2 AND ${invitation ? groupEligible() : groupVisible()}`,
      [user, id],
    )
  ).rows[0];
  if (!row) throw unavailable();
  return row;
}
export function authorize(
  g: GroupContext,
  action: Action | 'read' | 'interact' | 'post' | 'join',
) {
  if (action === 'read') {
    if (g.member_status !== 'active')
      throw new AuthError(403, 'Conteúdo disponível somente para membros.');
    return;
  }
  if (g.status !== 'active') throw new AuthError(409, 'Grupo arquivado.');
  if (g.suspended) throw new AuthError(403, 'Participação suspensa.');
  if (action === 'join') return;
  if (g.member_status !== 'active' || !g.role)
    throw new AuthError(403, 'Participação ativa necessária.');
  if (action === 'post' || action === 'interact') {
    if (g.accepted_rules_version !== g.rules_version)
      throw new AuthError(409, 'Aceite a versão atual das regras.');
    if (
      action === 'post' &&
      g.posting_policy === 'staff' &&
      g.role === 'member'
    )
      throw new AuthError(403, 'Publicações reservadas à equipe.');
    return;
  }
  if (action === 'invite' && g.members_can_invite) return;
  if (!(permissions[action] as readonly Role[]).includes(g.role))
    throw new AuthError(403, 'Cargo sem autorização para esta ação.');
}
export function canManage(
  g: GroupContext,
  target: { user_id: string; role: Role },
) {
  authorize(g, 'remove');
  const rank: Record<Role, number> = {
    member: 0,
    moderator: 1,
    admin: 2,
    owner: 3,
  };
  if (target.user_id === g.owner_id || rank[target.role] >= rank[g.role!])
    throw new AuthError(
      403,
      'Não é permitido alterar cargo igual ou superior.',
    );
}
