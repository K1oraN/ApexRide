import type { AdminContext } from './context.js';
import { AuthError } from '../auth/validation.js';
import * as v from './validation.js';
import { moderateContent } from './content.js';
import { decision } from './decision.js';
export function registerPlatform(ctx: AdminContext) {
  const { app, db, principal, param, tx, audit } = ctx;
  for (const kind of ['groups', 'events'] as const) {
    const p =
        kind === 'groups' ? 'admin.groups.moderate' : 'admin.events.moderate',
      table = kind === 'groups' ? 'groups' : 'social_events',
      type = kind === 'groups' ? 'group' : 'event';
    app.get(`/admin/${kind}`, async (r) => {
      const op = await principal(r, p),
        q = v.page(r.query),
        columns =
          kind === 'groups'
            ? 'id,name,owner_id,privacy_type,discovery_mode,status,created_at'
            : 'id,title,organizer_id,event_type,visibility,status,starts_at,ends_at,city,state,revision,created_at';
      const rows = (
        await db().query(
          `SELECT ${columns} FROM ${table} WHERE ($1='' OR status=$1) ORDER BY created_at DESC,id LIMIT 31 OFFSET $2`,
          [q.status, q.offset],
        )
      ).rows;
      await audit(db(), op.id, 'metadata_read', type, 'page', p, r.id);
      return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
    });
    app.post(`/admin/${kind}/:id/decision`, async (r) => {
      const op = await principal(r, p, true),
        key = param(r),
        b = v.fields(r.body, ['action', 'reason', 'confirm']),
        action = v.choice(
          b.action,
          kind === 'groups'
            ? ['hide', 'remove', 'restore']
            : ['hide', 'restore', 'cancel'],
        ),
        reason = v.text(b.reason);
      if (b.confirm !== 'CONFIRMAR')
        throw v.invalid('Digite CONFIRMAR para executar a decisão.');
      return tx(op, p, async (c) => {
        const caseId = await decision(c, op.id, type, key, action, reason);
        await moderateContent(
          c,
          op,
          type,
          key,
          action,
          action === 'restore' ? null : caseId,
          reason,
          r.id,
        );
        return { status: 'ok' };
      });
    });
  }
  app.get('/admin/routes/:id/review', async (r) => {
    const p = 'admin.routes.review',
      op = await principal(r, p),
      key = param(r);
    const row = (
      await db().query(
        `SELECT id,owner_id,name,description,kind,status,version,verification,direction,public.ST_AsGeoJSON(geometry)::json AS geometry,public.ST_AsGeoJSON(start_line)::json AS start_line FROM routes WHERE id=$1 AND status IN ('pending','approved')`,
        [key],
      )
    ).rows[0];
    if (!row)
      throw new AuthError(404, 'Representação não submetida para publicação.');
    await audit(db(), op.id, 'route_review_read', 'route', key, p, r.id);
    return { route: row };
  });
  app.get('/admin/circuits', async (r) => {
    await principal(r, 'admin.circuits.verify');
    const q = v.page(r.query);
    const rows = (
      await db().query(
        "SELECT id,name,status,version,verification,owner_id FROM routes WHERE kind='circuit' AND status IN ('pending','approved') ORDER BY created_at,id LIMIT 31 OFFSET $1",
        [q.offset],
      )
    ).rows;
    return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
  });
  app.post('/admin/circuits/:id/suspend-verification', async (r) => {
    const p = 'admin.circuits.verify',
      op = await principal(r, p, true),
      key = param(r),
      b = v.fields(r.body, ['reason', 'version']);
    const reason = v.text(b.reason),
      version = v.integer(b.version);
    return tx(op, p, async (c) => {
      const result = await c.query(
        "UPDATE routes SET verification='suggested',reason=$3,updated_at=now() WHERE id=$1 AND kind='circuit' AND version=$2 AND verification='verified' RETURNING id",
        [key, version, reason],
      );
      if (!result.rowCount)
        throw new AuthError(409, 'Circuito alterado ou não verificado.');
      await c.query(
        "UPDATE route_versions SET verified_at=NULL,plan=jsonb_set(plan,'{verification}','\"suggested\"') WHERE route_id=$1",
        [key],
      );
      await audit(
        c,
        op.id,
        'circuit_verification_suspended',
        'circuit',
        key,
        p,
        r.id,
      );
      return { status: 'ok' };
    });
  });
}
