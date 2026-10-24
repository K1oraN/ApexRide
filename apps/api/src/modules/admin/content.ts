import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { AuthError } from '../auth/validation.js';
import { audit, revalidate, type Operator } from './policy.js';
import { choice, invalid } from './validation.js';
// All dynamic SQL identifiers below originate in this constant allowlist.
const targets = {
  post: { table: 'social_posts', permission: 'admin.content.moderate' },
  comment: {
    table: 'social_post_comments',
    permission: 'admin.content.moderate',
  },
  photo: { table: 'social_post_media', permission: 'admin.content.moderate' },
  group: { table: 'groups', permission: 'admin.groups.moderate' },
  event: { table: 'social_events', permission: 'admin.events.moderate' },
} as const;
export async function moderateContent(
  c: PoolClient,
  op: Operator,
  type: string,
  target: string,
  action: string,
  caseId: string | null,
  reason: string,
  correlation: string,
) {
  const kind = choice(type, Object.keys(targets) as (keyof typeof targets)[]),
    spec = targets[kind];
  await revalidate(c, op, spec.permission);
  if (!op.permissions.includes(spec.permission))
    throw new AuthError(403, 'Sem permissão para este recurso.');
  const row = (
    await c.query(`SELECT * FROM ${spec.table} WHERE id=$1 FOR UPDATE`, [
      target,
    ])
  ).rows[0];
  if (!row) throw new AuthError(404, 'Recurso removido ou indisponível.');
  const owner = row.author_id ?? row.owner_id ?? row.organizer_id;
  if (owner === op.id)
    throw new AuthError(
      403,
      'Outro operador deve decidir sobre o seu conteúdo.',
    );
  if (kind === 'event' && action === 'remove') action = 'cancel';
  if (kind === 'event' && !['hide', 'restore', 'cancel'].includes(action))
    throw invalid('Ação inválida para evento.');
  if (action === 'restore') {
    const state = (
      await c.query(
        'DELETE FROM admin_content_states WHERE target_type=$1 AND target_id=$2 RETURNING previous_status,case_id',
        [kind, target],
      )
    ).rows[0];
    if (!state)
      throw new AuthError(409, 'Não há medida administrativa para restaurar.');
    if (caseId && state.case_id && state.case_id !== caseId)
      throw new AuthError(409, 'H? uma medida posterior; revise o caso atual.');
    if (kind === 'event' && row.status === 'cancelled')
      throw new AuthError(
        409,
        'Evento cancelado não pode ser reativado por restauração.',
      );
    if (kind === 'post' || kind === 'comment') {
      if (row.deleted_at)
        throw new AuthError(
          409,
          'Conteúdo excluído pelo autor não pode ser restaurado.',
        );
      await c.query(`UPDATE ${spec.table} SET status=$2 WHERE id=$1`, [
        target,
        state.previous_status ?? 'published',
      ]);
    }
    if (kind === 'group')
      await c.query(
        'UPDATE groups SET status=$2,updated_at=now() WHERE id=$1',
        [target, state.previous_status ?? 'active'],
      );
  } else {
    const state = action === 'remove' ? 'removed' : 'hidden';
    if (['deleted', 'cancelled'].includes(row.status))
      throw new AuthError(409, 'Recurso já excluído ou cancelado.');
    await c.query(
      `INSERT INTO admin_content_states(target_type,target_id,state,case_id,previous_status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(target_type,target_id) DO UPDATE SET state=excluded.state,case_id=excluded.case_id`,
      [kind, target, state, caseId, row.status ?? null],
    );
    if (kind === 'post' || kind === 'comment')
      await c.query(`UPDATE ${spec.table} SET status=$2 WHERE id=$1`, [
        target,
        action === 'remove' ? 'deleted' : 'restricted',
      ]);
    if (kind === 'group')
      await c.query(
        "UPDATE groups SET status='archived',updated_at=now() WHERE id=$1",
        [target],
      );
    if (kind === 'event' && action === 'cancel') {
      await c.query(
        "UPDATE social_events SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=$1",
        [target],
      );
      await c.query(
        "INSERT INTO event_actions(event_id,actor_id,action) VALUES($1,$2,'admin_cancel')",
        [target, op.id],
      );
    }
  }
  if (kind === 'group')
    await c.query(
      'INSERT INTO group_moderation_actions(id,group_id,actor_id,action,reason) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), target, op.id, 'global_' + action, reason],
    );
  await audit(
    c,
    op.id,
    'content_' + action,
    kind,
    target,
    spec.permission,
    correlation,
    'allowed',
    'operator_decision',
    reason,
  );
}
