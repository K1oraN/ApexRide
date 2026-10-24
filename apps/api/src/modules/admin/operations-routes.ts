import { randomUUID } from 'node:crypto';
import type { AdminContext } from './context.js';
import { createPrincipal } from '../auth/session.js';
import { rate } from './policy.js';
import { AuthError } from '../auth/validation.js';
import * as v from './validation.js';
export function registerOperations(ctx: AdminContext) {
  const { app, db, config, principal, param, tx, audit } = ctx,
    common = createPrincipal(config, db);
  app.get('/admin/dashboard', async (r) => {
    await principal(r, 'admin.dashboard.read');
    const q = v.page(r.query),
      from = q.from ?? new Date(Date.now() - 7 * 86400000),
      to = q.to ?? new Date();
    if (to <= from || to.getTime() - from.getTime() > 93 * 86400000)
      throw v.invalid('Período deve ter no máximo 93 dias.');
    const metrics = (
      await db().query(
        `SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM users WHERE created_at>=$1 AND created_at<$2) AS new_users,
    (SELECT count(DISTINCT user_id)::int FROM user_sessions WHERE last_used_at>=$1 AND last_used_at<$2) AS active_users,
    (SELECT count(*)::int FROM social_posts WHERE status='published') AS posts,
    (SELECT count(*)::int FROM groups WHERE status='active') AS groups,
    (SELECT count(*)::int FROM social_events WHERE status='scheduled' AND ends_at>now()) AS events,
    (SELECT count(*)::int FROM routes WHERE kind='route' AND status='pending') AS pending_routes,
    (SELECT count(*)::int FROM routes WHERE kind='circuit' AND status IN ('pending','approved') AND verification='suggested') AS pending_circuits,
    (SELECT count(*)::int FROM moderation_cases WHERE status IN ('open','reopened')) AS open_reports,
    (SELECT count(*)::int FROM moderation_cases WHERE priority='high' AND status IN ('open','reopened','reviewing','waiting','escalated')) AS priority_reports,
    (SELECT count(*)::int FROM moderation_cases WHERE status IN ('reviewing','waiting','escalated')) AS reviewing,
    (SELECT count(*)::int FROM gamification_jobs) AS pending_xp,
    (SELECT count(*)::int FROM gamification_reviews WHERE status='pending') AS xp_anomalies,
    (SELECT count(*)::int FROM privacy_requests WHERE status NOT IN ('completed','rejected')) AS privacy_requests,
    (SELECT count(*)::int FROM security_incidents WHERE status<>'closed') AS incidents,
    (SELECT count(*)::int FROM live_location_sessions s JOIN social_events e ON e.id=s.event_id WHERE s.revoked_at IS NULL AND s.expires_at>now() AND e.status='scheduled' AND e.ends_at>now()) AS active_social_sessions`,
        [from, to],
      )
    ).rows[0];
    const registrationsByDay = (
      await db().query(
        `SELECT to_char(d,'YYYY-MM-DD') AS day,count(u.id)::int AS count FROM generate_series(date_trunc('day',$1::timestamptz AT TIME ZONE 'America/Sao_Paulo'),date_trunc('day',$2::timestamptz AT TIME ZONE 'America/Sao_Paulo'),interval '1 day') d LEFT JOIN users u ON u.created_at>=$1 AND u.created_at<$2 AND (u.created_at AT TIME ZONE 'America/Sao_Paulo')>=d AND (u.created_at AT TIME ZONE 'America/Sao_Paulo')<d+interval '1 day' GROUP BY d ORDER BY d`,
        [from, to],
      )
    ).rows;
    return {
      metrics,
      registrationsByDay,
      period: { from, to },
      activeDefinition:
        'Contas distintas com uso autenticado de sessão no período; não significa online.',
      inventoryDefinition:
        'Inventário e filas refletem o estado atual; novos e ativos usam o período selecionado.',
    };
  });
  app.get('/moderation/notice', async (r) => {
    await common(r);
    return {
      notice:
        (
          await db().query(
            "SELECT settings->>'reportNotice' AS notice FROM admin_settings_versions ORDER BY id DESC LIMIT 1",
          )
        ).rows[0]?.notice ?? '',
    };
  });
  app.post('/privacy/requests', async (r) => {
    const { user } = await common(r, true),
      b = v.fields(r.body, ['kind', 'explanation', 'operationId']),
      kind = v.choice(b.kind, [
        'access',
        'correction',
        'deletion',
        'consent',
        'export',
        'question',
      ]),
      explanation = v.text(b.explanation, 5, 1000),
      operation = v.id(b.operationId);
    await rate(db(), 'privacy:' + user.id, 5, 60);
    const result = await db().query(
      'INSERT INTO privacy_requests(id,user_id,kind,explanation,operation_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(operation_id) DO NOTHING RETURNING id',
      [randomUUID(), user.id, kind, explanation, operation],
    );
    if (!result.rowCount)
      throw new AuthError(409, 'Solicitação já registrada.');
    return { status: 'ok', id: result.rows[0].id };
  });
  app.get('/privacy/requests', async (r) => {
    const { user } = await common(r);
    return {
      items: (
        await db().query(
          'SELECT id,kind,status,explanation,resolution,created_at FROM privacy_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
          [user.id],
        )
      ).rows,
    };
  });
  app.get('/admin/privacy', async (r) => {
    const p = 'admin.privacy.requests',
      op = await principal(r, p),
      q = v.page(r.query),
      rows = (
        await db().query(
          "SELECT id,user_id,kind,status,explanation,identity_verified_at,owner_id,resolution,version,created_at FROM privacy_requests WHERE ($1='' OR status=$1) ORDER BY created_at,id LIMIT 31 OFFSET $2",
          [q.status, q.offset],
        )
      ).rows;
    await audit(db(), op.id, 'privacy_queue_read', 'privacy', 'page', p, r.id);
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.post('/admin/privacy/:id/decision', async (r) => {
    const p = 'admin.privacy.requests',
      op = await principal(r, p, true),
      key = param(r),
      b = v.fields(r.body, [
        'status',
        'identityVerified',
        'resolution',
        'version',
      ]),
      status = v.choice(b.status, [
        'verifying',
        'processing',
        'completed',
        'rejected',
      ]),
      resolution = v.text(b.resolution, 5, 1000),
      version = v.integer(b.version);
    if (
      b.identityVerified !== undefined &&
      typeof b.identityVerified !== 'boolean'
    )
      throw v.invalid();
    return tx(op, p, async (c) => {
      const row = (
        await c.query('SELECT * FROM privacy_requests WHERE id=$1 FOR UPDATE', [
          key,
        ])
      ).rows[0];
      if (
        !row ||
        row.version !== version ||
        ['completed', 'rejected'].includes(row.status)
      )
        throw new AuthError(409, 'Solicitação alterada ou encerrada.');
      const allowed: Record<string, string[]> = {
        received: ['verifying', 'rejected'],
        verifying: ['processing', 'rejected'],
        processing: ['completed', 'rejected'],
      };
      if (!allowed[row.status]?.includes(status))
        throw new AuthError(409, 'Transição de solicitação inválida.');
      if (
        ['processing', 'completed'].includes(status) &&
        !row.identity_verified_at &&
        b.identityVerified !== true
      )
        throw v.invalid('Verificação operacional de identidade obrigatória.');
      await c.query(
        'UPDATE privacy_requests SET status=$2,resolution=$3,owner_id=$4,identity_verified_by=CASE WHEN $5 THEN $4 ELSE identity_verified_by END,identity_verified_at=CASE WHEN $5 THEN now() ELSE identity_verified_at END,version=version+1,updated_at=now() WHERE id=$1',
        [key, status, resolution, op.id, b.identityVerified === true],
      );
      await audit(
        c,
        op.id,
        'privacy_' + status,
        'privacy',
        key,
        p,
        r.id,
        'allowed',
        'operator_decision',
        resolution,
      );
      return { status: 'ok' };
    });
  });
  app.get('/admin/security/incidents', async (r) => {
    const access = await principal(r);
    await principal(
      r,
      access.permissions.includes('admin.incidents.manage')
        ? 'admin.incidents.manage'
        : 'admin.security.read',
    );
    const q = v.page(r.query),
      rows = (
        await db().query(
          "SELECT id,category,severity,status,description,containment,owner_id,version,created_at,resolved_at FROM security_incidents WHERE ($1='' OR status=$1) ORDER BY created_at DESC,id LIMIT 31 OFFSET $2",
          [q.status, q.offset],
        )
      ).rows;
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.post('/admin/security/incidents', async (r) => {
    const p = 'admin.incidents.manage',
      op = await principal(r, p),
      b = v.fields(r.body, ['category', 'severity', 'description']),
      category = v.text(b.category, 3, 60),
      severity = v.choice(b.severity, ['low', 'medium', 'high', 'critical']),
      description = v.text(b.description, 5, 1000),
      key = randomUUID();
    return tx(op, p, async (c) => {
      await c.query(
        'INSERT INTO security_incidents(id,category,severity,description,owner_id) VALUES($1,$2,$3,$4,$5)',
        [key, category, severity, description, op.id],
      );
      await audit(c, op.id, 'incident_created', 'incident', key, p, r.id);
      return { status: 'ok', id: key };
    });
  });
  app.post('/admin/security/incidents/:id/decision', async (r) => {
    const p = 'admin.incidents.manage',
      op = await principal(r, p),
      key = param(r),
      b = v.fields(r.body, ['status', 'containment', 'version']),
      status = v.choice(b.status, [
        'analysis',
        'containment',
        'correction',
        'verification',
        'closed',
      ]),
      containment = v.text(b.containment, 5, 1000),
      version = v.integer(b.version);
    return tx(op, p, async (c) => {
      const row = (
        await c.query(
          'SELECT status,version FROM security_incidents WHERE id=$1 FOR UPDATE',
          [key],
        )
      ).rows[0];
      const steps = [
        'received',
        'analysis',
        'containment',
        'correction',
        'verification',
        'closed',
      ];
      if (
        !row ||
        row.version !== version ||
        steps.indexOf(status) !== steps.indexOf(row.status) + 1
      )
        throw new AuthError(409, 'Incidente alterado ou transição inválida.');
      await c.query(
        "UPDATE security_incidents SET status=$2,containment=$3,version=version+1,resolved_at=CASE WHEN $2='closed' THEN now() ELSE NULL END WHERE id=$1",
        [key, status, containment],
      );
      await audit(
        c,
        op.id,
        'incident_' + status,
        'incident',
        key,
        p,
        r.id,
        'allowed',
        'operator_decision',
        containment,
      );
      return { status: 'ok' };
    });
  });
  app.get('/admin/settings', async (r) => {
    await principal(r, 'admin.settings.manage');
    return {
      items: (
        await db().query(
          'SELECT id,settings,reason,created_at FROM admin_settings_versions ORDER BY id DESC LIMIT 30',
        )
      ).rows,
    };
  });
  app.post('/admin/settings', async (r) => {
    const p = 'admin.settings.manage',
      op = await principal(r, p, true),
      b = v.fields(r.body, ['reportNotice', 'reason', 'version']),
      notice = v.text(b.reportNotice, 5, 300),
      reason = v.text(b.reason),
      version = v.integer(b.version);
    return tx(op, p, async (c) => {
      const current = (
        await c.query(
          'SELECT id FROM admin_settings_versions ORDER BY id DESC LIMIT 1',
        )
      ).rows[0];
      if (Number(current.id) !== version)
        throw new AuthError(409, 'Configuração alterada.');
      await c.query(
        'INSERT INTO admin_settings_versions(settings,actor_id,reason) VALUES($1,$2,$3)',
        [JSON.stringify({ reportNotice: notice }), op.id, reason],
      );
      await audit(
        c,
        op.id,
        'settings_versioned',
        'settings',
        'reportNotice',
        p,
        r.id,
      );
      return { status: 'ok' };
    });
  });
}
