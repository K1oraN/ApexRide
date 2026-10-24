import { randomUUID } from 'node:crypto';
import type { PhotoStorage } from '../motorcycles/photos.js';
import type { AdminContext } from './context.js';
import { AuthError } from '../auth/validation.js';
import * as v from './validation.js';
import { moderateContent } from './content.js';
export function registerModeration(ctx: AdminContext, storage: PhotoStorage) {
  const { app, db, principal, param, tx, audit } = ctx;
  app.get('/admin/reports', async (r) => {
    const op = await principal(r, 'admin.reports.read'),
      q = v.page(r.query);
    const rows = await db().query(
      `SELECT c.id,c.target_type,c.target_id,c.priority,c.status,c.assigned_to,c.version,c.created_at,s.reason FROM moderation_cases c LEFT JOIN social_reports s ON s.id=c.source_report_id WHERE ($1='' OR c.status=$1) AND ($2::boolean OR c.assigned_to=$3 OR c.assigned_to IS NULL) ORDER BY c.priority,c.created_at,c.id LIMIT 31 OFFSET $4`,
      [
        q.status,
        op.roles.some((x) => ['superadmin', 'platform'].includes(x)),
        op.id,
        q.offset,
      ],
    );
    return { items: rows.rows.slice(0, 30), hasMore: rows.rows.length > 30 };
  });
  async function caseFor(
    op: Awaited<ReturnType<typeof principal>>,
    key: string,
  ) {
    const c = (
      await db().query('SELECT * FROM moderation_cases WHERE id=$1', [key])
    ).rows[0];
    if (!c) throw new AuthError(404, 'Caso não encontrado.');
    if (
      c.assigned_to !== op.id &&
      !op.roles.some((x) => ['superadmin', 'platform'].includes(x))
    )
      throw new AuthError(403, 'Caso não atribuído a este operador.');
    return c;
  }
  app.post('/admin/reports/:id/assign', async (r) => {
    const p = 'admin.reports.review',
      op = await principal(r, p),
      b = v.fields(r.body, ['assignedTo', 'version', 'reason']),
      key = param(r),
      who = v.id(b.assignedTo),
      version = v.integer(b.version);
    v.text(b.reason);
    if (
      who !== op.id &&
      !op.roles.some((x) => ['superadmin', 'platform'].includes(x))
    )
      throw new AuthError(
        403,
        'Somente supervisores podem atribuir casos a terceiros.',
      );
    return tx(op, p, async (c) => {
      const allowed = await c.query(
        `SELECT 1 FROM admin_user_roles u JOIN admin_roles ar ON ar.code=u.role_code AND ar.enabled JOIN admin_role_permissions rp ON rp.role_code=u.role_code WHERE u.user_id=$1 AND u.revoked_at IS NULL AND rp.permission_code='admin.reports.review'`,
        [who],
      );
      if (!allowed.rowCount) throw v.invalid('Revisor sem permissão.');
      const row = await c.query(
        `UPDATE moderation_cases SET assigned_to=$2,status='reviewing',version=version+1,updated_at=now() WHERE id=$1 AND version=$3 AND status IN ('open','reopened','reviewing','escalated','waiting') RETURNING id`,
        [key, who, version],
      );
      if (!row.rowCount)
        throw new AuthError(409, 'Caso alterado ou encerrado.');
      await audit(
        c,
        op.id,
        'case_assigned',
        'case',
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
  app.get('/admin/reports/:id', async (r) => {
    const p = 'admin.reports.read',
      op = await principal(r, p),
      key = param(r),
      c = await caseFor(op, key);
    const report = (
      await db().query(
        'SELECT reason,detail,created_at FROM social_reports WHERE id=$1',
        [c.source_report_id],
      )
    ).rows[0];
    const specs: Record<string, string> = {
      post: 'SELECT id,author_id,text,status,visibility FROM social_posts WHERE id=$1',
      comment:
        'SELECT id,author_id,text,status,post_id FROM social_post_comments WHERE id=$1',
      photo:
        'SELECT id,owner_id,post_id,width,height,bytes FROM social_post_media WHERE id=$1',
      profile: 'SELECT id,display_name,username FROM users WHERE id=$1',
      group_member: 'SELECT id,display_name,username FROM users WHERE id=$1',
      group: 'SELECT id,name,status,privacy_type FROM groups WHERE id=$1',
      event:
        'SELECT id,title,status,event_type,visibility,starts_at,ends_at FROM social_events WHERE id=$1',
      route:
        "SELECT id,name,kind,status FROM routes WHERE id=$1 AND status IN ('pending','approved')",
      circuit:
        "SELECT id,name,kind,status FROM routes WHERE id=$1 AND status IN ('pending','approved')",
    };
    const evidence =
      (await db().query(specs[c.target_type]!, [c.target_id])).rows[0] ?? null;
    const photos =
      c.target_type === 'post'
        ? (
            await db().query(
              'SELECT id,width,height FROM social_post_media WHERE post_id=$1 ORDER BY position',
              [c.target_id],
            )
          ).rows
        : [];
    await audit(db(), op.id, 'case_evidence_read', 'case', key, p, r.id);
    return {
      case: c,
      report,
      evidence,
      photos,
      decisions: (
        await db().query(
          'SELECT id,reviewer_id,action,reason_code,explanation,created_at FROM moderation_decisions WHERE case_id=$1 ORDER BY created_at DESC LIMIT 30',
          [key],
        )
      ).rows,
    };
  });
  app.get('/admin/reports/:id/media/:mediaId', async (r, reply) => {
    const p = 'admin.reports.read',
      op = await principal(r, p),
      c = await caseFor(op, param(r)),
      media = v.id((r.params as { mediaId: string }).mediaId);
    if (!['photo', 'post'].includes(c.target_type))
      throw new AuthError(403, 'Mídia fora do escopo do caso.');
    const row = (
      await db().query(
        "SELECT file_ref FROM social_post_media WHERE id=$1 AND (($2='photo' AND id=$3) OR ($2='post' AND post_id=$3))",
        [media, c.target_type, c.target_id],
      )
    ).rows[0];
    if (!row) throw new AuthError(404, 'Evidência indisponível.');
    await audit(db(), op.id, 'case_media_read', 'case', c.id, p, r.id);
    reply.type('image/webp').header('Content-Disposition', 'inline');
    return storage.get(row.file_ref);
  });
  app.post('/admin/reports/:id/resolve', async (r) => {
    const p = 'admin.reports.review',
      op = await principal(r, p),
      key = param(r),
      b = v.fields(r.body, [
        'action',
        'reasonCode',
        'explanation',
        'version',
        'operationId',
      ]);
    const action = v.choice(b.action, [
        'dismiss',
        'hide',
        'remove',
        'restore',
        'waiting',
        'escalate',
      ] as const),
      reason = v.text(b.explanation, 5, 2000),
      code = v.text(b.reasonCode, 3, 60),
      operation = v.id(b.operationId),
      version = v.integer(b.version);
    await caseFor(op, key);
    return tx(op, p, async (c) => {
      const prior = (
        await c.query(
          'SELECT case_id,reviewer_id,action,reason_code,explanation FROM moderation_decisions WHERE operation_id=$1',
          [operation],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.case_id !== key ||
          prior.reviewer_id !== op.id ||
          prior.action !== action ||
          prior.reason_code !== code ||
          prior.explanation !== reason
        )
          throw new AuthError(409, 'Operação já utilizada.');
        return { status: 'ok', repeated: true };
      }
      const row = (
        await c.query('SELECT * FROM moderation_cases WHERE id=$1 FOR UPDATE', [
          key,
        ])
      ).rows[0];
      if (
        !row ||
        row.version !== version ||
        !['open', 'reviewing', 'reopened', 'waiting', 'escalated'].includes(
          row.status,
        )
      )
        throw new AuthError(409, 'Caso alterado ou encerrado.');
      if (row.assigned_to !== op.id)
        throw new AuthError(403, 'Assuma o caso antes da decisão.');
      if (['hide', 'remove', 'restore'].includes(action))
        await moderateContent(
          c,
          op,
          row.target_type,
          row.target_id,
          action,
          key,
          reason,
          r.id,
        );
      const status =
        action === 'dismiss'
          ? 'dismissed'
          : action === 'waiting'
            ? 'waiting'
            : action === 'escalate'
              ? 'escalated'
              : 'resolved';
      await c.query(
        'INSERT INTO moderation_decisions(id,case_id,reviewer_id,action,reason_code,explanation,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(), key, op.id, action, code, reason, operation],
      );
      await c.query(
        `UPDATE moderation_cases SET status=$2,version=version+1,updated_at=now(),closed_at=CASE WHEN $2 IN ('resolved','dismissed') THEN now() ELSE NULL END WHERE id=$1`,
        [key, status],
      );
      await c.query('UPDATE social_reports SET status=$2 WHERE id=$1', [
        row.source_report_id,
        status === 'dismissed'
          ? 'dismissed'
          : status === 'resolved'
            ? 'reviewed'
            : 'pending',
      ]);
      await audit(c, op.id, 'case_' + action, 'case', key, p, r.id);
      return { status: 'ok' };
    });
  });
  app.post('/admin/reports/:id/reopen', async (r) => {
    const p = 'admin.reports.review',
      op = await principal(r, p),
      key = param(r),
      b = v.fields(r.body, ['reason', 'version']);
    v.text(b.reason);
    const version = v.integer(b.version);
    await caseFor(op, key);
    return tx(op, p, async (c) => {
      const row = await c.query(
        "UPDATE moderation_cases SET status='reopened',closed_at=NULL,version=version+1 WHERE id=$1 AND version=$2 AND status IN ('resolved','dismissed') RETURNING source_report_id",
        [key, version],
      );
      if (!row.rowCount) throw new AuthError(409, 'Caso já alterado.');
      await c.query("UPDATE social_reports SET status='pending' WHERE id=$1", [
        row.rows[0].source_report_id,
      ]);
      await audit(
        c,
        op.id,
        'case_reopened',
        'case',
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
