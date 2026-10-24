import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
export async function transaction<T>(
  pool: Pool,
  actors: string[],
  run: (c: PoolClient) => Promise<T>,
) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      'SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [[...new Set(actors)].sort()],
    );
    const result = await run(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function audit(
  c: PoolClient,
  group: string,
  actor: string,
  action: string,
  target: string | null = null,
  reason = '',
) {
  await c.query(
    'INSERT INTO group_moderation_actions(id,group_id,actor_id,action,target_id,reason) VALUES($1,$2,$3,$4,$5,$6)',
    [randomUUID(), group, actor, action, target, reason],
  );
}
export const groupSelect = `SELECT g.id,g.slug,g.name,g.description,g.privacy_type,g.discovery_mode,g.join_policy,g.posting_policy,g.members_can_invite,g.city,g.state,g.categories,g.rules,g.rules_version,g.status,g.created_at,g.updated_at,
  m.role,m.status AS member_status,m.accepted_rules_version,
  CASE WHEN g.privacy_type='public' OR m.status='active' THEN g.member_count ELSE NULL END AS member_count,
  COALESCE((SELECT jsonb_object_agg(sm.group_slot,'/social/media/'||sm.id) FROM social_post_media sm WHERE sm.group_id=g.id),'{}') AS images
  FROM groups g LEFT JOIN group_memberships m ON m.group_id=g.id AND m.user_id=$1`;
