import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { digest, secret } from '../auth/security.js';
import { AuthError } from '../auth/validation.js';
import * as v from '../social/validation.js';
import { notBlocked } from '../social/block-policy.js';
import {
  authorize,
  canManage,
  context,
  groupEligible,
  groupVisible,
  type Role,
} from './policy.js';
import { audit, groupSelect, transaction } from './store.js';
import * as gv from './validation.js';

export async function groupRoutes(
  app: FastifyInstance,
  options: { config: Config; pool?: Pool | undefined },
) {
  const db = () => {
    if (!options.pool)
      throw new AuthError(503, 'Grupos temporariamente indisponíveis.');
    return options.pool;
  };
  const principal = createPrincipal(options.config, db),
    users = new WeakMap<FastifyRequest, string | null>();
  const viewer = (r: FastifyRequest) => users.get(r) ?? null;
  const user = (r: FastifyRequest) => {
    const id = viewer(r);
    if (!id) throw new AuthError(401, 'Entre na sua conta para continuar.');
    return id;
  };
  const gid = (r: FastifyRequest) => v.id((r.params as { id: string }).id);
  const uid = (r: FastifyRequest) =>
    v.id((r.params as { userId: string }).userId);
  app.addHook('onRequest', sessionGuard(options.config));
  app.addHook('onRequest', async (r, reply) => {
    reply
      .header('Cache-Control', 'private, no-store')
      .header('Vary', 'Cookie')
      .header('X-Content-Type-Options', 'nosniff');
    const write = !['GET', 'HEAD'].includes(r.method);
    try {
      users.set(r, (await principal(r, write)).user.id);
    } catch (e) {
      if (write || !(e instanceof AuthError && e.statusCode === 401)) throw e;
    }
    const route = r.routeOptions.url ?? '',
      max = write
        ? route.endsWith('/groups')
          ? 5
          : route.includes('invitations')
            ? 20
            : 60
        : 180;
    const count = await db().query(
      `INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+interval '1 minute' ELSE auth_rate_limits.expires_at END RETURNING attempts`,
      [
        digest(
          `groups:${viewer(r) ?? r.ip}:${r.method}:${write ? route : 'read'}`,
        ),
      ],
    );
    if (count.rows[0].attempts > max)
      throw new AuthError(429, 'Limite atingido. Aguarde um minuto.');
  });
  async function detail(who: string | null, id: string) {
    const row = (
      await db().query(`${groupSelect} WHERE g.id=$2 AND ${groupVisible()}`, [
        who,
        id,
      ])
    ).rows[0];
    if (!row) throw v.unavailable();
    return row;
  }
  async function change(
    r: FastifyRequest,
    run: (
      c: PoolClient,
      who: string,
      id: string,
      g: Awaited<ReturnType<typeof context>>,
    ) => Promise<unknown>,
    actors: string[] = [],
  ) {
    const who = user(r),
      id = gid(r);
    await transaction(db(), [who, ...actors], async (c) =>
      run(c, who, id, await context(c, who, id, true)),
    );
    return { status: 'ok' };
  }
  async function search(r: FastifyRequest, mine = false) {
    const who = mine ? user(r) : viewer(r),
      q = (r.query ?? {}) as Record<string, unknown>,
      p = v.page(r.query);
    const filter = gv.choice(q.filter ?? (mine ? 'mine' : 'all'), [
      'all',
      'public',
      'private',
      'mine',
      'admin',
      'owner',
      'pending',
    ]);
    if (['mine', 'admin', 'owner', 'pending'].includes(filter)) user(r);
    const sort = gv.choice(q.sort ?? 'recent', ['recent', 'name', 'members']),
      values: unknown[] = [who],
      clauses = [
        groupVisible(),
        ['mine', 'admin', 'owner'].includes(filter)
          ? "g.status<>'deleted'"
          : "g.status='active'",
      ];
    const bind = (x: unknown) => {
      values.push(x);
      return `$${values.length}`;
    };
    if (q.q) {
      const term = v.text(q.q, 100, true);
      clauses.push(
        `(lower(g.name) LIKE ${bind(term.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%')} OR to_tsvector('portuguese',g.name||' '||g.description) @@ plainto_tsquery('portuguese',${bind(term)}))`,
      );
    }
    if (q.city)
      clauses.push(`lower(g.city)=lower(${bind(v.text(q.city, 100, true))})`);
    if (q.state)
      clauses.push(
        `g.state=${bind(gv.choice(String(q.state).toUpperCase(), gv.STATES))}`,
      );
    if (q.category)
      clauses.push(`${bind(v.text(q.category, 50, true))}=ANY(g.categories)`);
    if (filter === 'public' || filter === 'private')
      clauses.push(`g.privacy_type=${bind(filter)}`);
    if (filter === 'mine') clauses.push("m.status='active'");
    if (filter === 'admin')
      clauses.push("m.status='active' AND m.role IN ('owner','admin')");
    if (filter === 'owner')
      clauses.push("m.status='active' AND m.role='owner'");
    if (filter === 'pending')
      clauses.push("m.status IN ('pending','rejected','cancelled')");
    if (q.profileId) {
      const target = v.id(q.profileId);
      clauses.push(
        `EXISTS(SELECT 1 FROM group_memberships pm JOIN users pu ON pu.id=pm.user_id JOIN privacy_settings pp ON pp.user_id=pu.id WHERE pm.group_id=g.id AND pm.user_id=${bind(target)} AND pm.status='active' AND pu.account_status='active' AND ${notBlocked('pu.id')} AND (pu.id=$1 OR (g.privacy_type='public' AND pp.profile_visibility='public')))`,
      );
    }
    // Name/member sorting uses a bounded page; recent mode shares the social cursor.
    let offset = 0;
    if (sort !== 'recent') {
      offset = q.cursor
        ? Number(
            JSON.parse(
              Buffer.from(String(q.cursor), 'base64url').toString('utf8'),
            ).offset,
          )
        : Number(q.offset ?? 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
        throw new AuthError(400, 'Página inválida.');
    } else if (p.at)
      clauses.push(
        `(g.created_at,g.id)<(${bind(p.at)}::timestamptz,${bind(p.key)}::uuid)`,
      );
    const rows = await db().query(
      `${groupSelect} WHERE ${clauses.join(' AND ')} ORDER BY ${sort === 'name' ? 'lower(g.name),g.id' : sort === 'members' ? 'member_count DESC NULLS LAST,g.id' : 'g.created_at DESC,g.id DESC'} LIMIT ${bind(p.limit + 1)} OFFSET ${bind(offset)}`,
      values,
    );
    if (sort === 'recent')
      return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
    const items = rows.rows.slice(0, p.limit),
      last = items.at(-1);
    return {
      status: 'ok',
      items,
      nextCursor:
        rows.rows.length > p.limit && last
          ? Buffer.from(
              JSON.stringify({
                id: last.id,
                at: last.created_at.toISOString(),
                offset: offset + p.limit,
              }),
            ).toString('base64url')
          : null,
    };
  }
  app.get('/groups', (r) => search(r));
  app.get('/groups/mine', (r) => search(r, true));
  app.get('/groups/:id', async (r) => ({
    status: 'ok',
    group: await detail(viewer(r), gid(r)),
  }));
  app.get('/groups/:id/rules', async (r) => {
    const g = await detail(viewer(r), gid(r));
    return { status: 'ok', rules: g.rules, version: g.rules_version };
  });
  app.post('/groups', async (r, reply) => {
    const who = user(r),
      b = gv.settings(r.body),
      creation = gv.creationKey(r.body);
    const id = await transaction(db(), [who], async (c) => {
      const old = (
        await c.query(
          'SELECT id FROM groups WHERE creator_id=$1 AND creation_key=$2',
          [who, creation],
        )
      ).rows[0];
      if (old) return old.id as string;
      const key = randomUUID(),
        slug =
          b.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 65) +
          '-' +
          key.slice(0, 8);
      await c.query(
        `INSERT INTO groups(id,slug,owner_id,creator_id,creation_key,name,description,privacy_type,discovery_mode,join_policy,posting_policy,members_can_invite,city,state,categories,rules) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          key,
          slug,
          who,
          creation,
          b.name,
          b.description,
          b.privacy,
          b.discovery,
          b.join,
          b.posting,
          b.invites,
          b.city,
          b.state,
          b.categories,
          JSON.stringify(b.rules),
        ],
      );
      await c.query(
        "INSERT INTO group_memberships(group_id,user_id,role,status,accepted_rules_version,joined_at) VALUES($1,$2,'owner','active',1,now())",
        [key, who],
      );
      await c.query(
        'INSERT INTO group_rules_versions(group_id,version,rules,actor_id) VALUES($1,1,$2,$3)',
        [key, JSON.stringify(b.rules), who],
      );
      await audit(c, key, who, 'create');
      return key;
    });
    return reply.code(201).send({ status: 'ok', group: await detail(who, id) });
  });
  app.patch('/groups/:id', async (r) => {
    const b = gv.settings(r.body);
    await change(r, async (c, who, id, g) => {
      authorize(g, 'edit');
      const privacy =
        b.privacy !== g.privacy_type || b.discovery !== g.discovery_mode;
      if (privacy) {
        authorize(g, 'privacy');
        if (v.object(r.body).confirmPrivacy !== true)
          throw new AuthError(409, 'Confirme a alteração de privacidade.');
      }
      const old = (await c.query('SELECT rules FROM groups WHERE id=$1', [id]))
        .rows[0];
      const version =
        g.rules_version +
        (JSON.stringify(old.rules) !== JSON.stringify(b.rules) ? 1 : 0);
      await c.query(
        'UPDATE groups SET name=$2,description=$3,privacy_type=$4,discovery_mode=$5,join_policy=$6,posting_policy=$7,members_can_invite=$8,city=$9,state=$10,categories=$11,rules=$12,rules_version=$13,updated_at=now() WHERE id=$1',
        [
          id,
          b.name,
          b.description,
          b.privacy,
          b.discovery,
          b.join,
          b.posting,
          b.invites,
          b.city,
          b.state,
          b.categories,
          JSON.stringify(b.rules),
          version,
        ],
      );
      if (version !== g.rules_version) {
        await c.query(
          'INSERT INTO group_rules_versions(group_id,version,rules,actor_id) VALUES($1,$2,$3,$4)',
          [id, version, JSON.stringify(b.rules), who],
        );
        await audit(c, id, who, 'rules');
      }
      if (b.privacy === 'private' && g.privacy_type === 'public')
        await c.query(
          'UPDATE social_posts SET group_private=true WHERE group_id=$1',
          [id],
        );
      // Pending requests retain their explicit review requirement after policy changes.
      await audit(c, id, who, privacy ? 'privacy' : 'edit');
    });
    return { status: 'ok', group: await detail(user(r), gid(r)) };
  });
  for (const action of ['archive', 'restore', 'delete'] as const) {
    const handler = (r: FastifyRequest) =>
      change(r, async (c, who, id, g) => {
        if (g.role !== 'owner' || g.member_status !== 'active' || g.suspended)
          throw new AuthError(
            403,
            'Somente o proprietário pode alterar o estado.',
          );
        if (v.object(r.body).confirm !== true)
          throw new AuthError(409, 'Confirme esta ação.');
        await c.query(
          'UPDATE groups SET status=$2,updated_at=now() WHERE id=$1',
          [
            id,
            action === 'archive'
              ? 'archived'
              : action === 'restore'
                ? 'active'
                : 'deleted',
          ],
        );
        if (action === 'delete')
          await c.query(
            "UPDATE group_invitations SET status='revoked' WHERE group_id=$1 AND status='pending'",
            [id],
          );
        await audit(c, id, who, action);
      });
    if (action === 'delete') app.delete('/groups/:id', handler);
    else app.post(`/groups/:id/${action}`, handler);
  }
  app.post('/groups/:id/join', (r) =>
    change(r, async (c, who, id, g) => {
      authorize(g, 'join');
      gv.acceptance(r.body, g.rules_version);
      if (g.member_status === 'active' || g.member_status === 'pending')
        throw new AuthError(409, 'Participação ou solicitação já registrada.');
      const status =
        g.privacy_type === 'private' || g.join_policy === 'approval'
          ? 'pending'
          : 'active';
      await c.query(
        `INSERT INTO group_memberships(group_id,user_id,status,accepted_rules_version,joined_at) VALUES($1,$2,$3,$4,CASE WHEN $3='active' THEN now() END) ON CONFLICT(group_id,user_id) DO UPDATE SET role='member',status=$3,accepted_rules_version=$4,joined_at=CASE WHEN $3='active' THEN now() END,updated_at=now()`,
        [id, who, status, g.rules_version],
      );
      await audit(c, id, who, status === 'active' ? 'join' : 'request', who);
    }),
  );
  app.post('/groups/:id/accept-rules', (r) =>
    change(r, async (c, who, id, g) => {
      authorize(g, 'read');
      gv.acceptance(r.body, g.rules_version);
      await c.query(
        'UPDATE group_memberships SET accepted_rules_version=$3,updated_at=now() WHERE group_id=$1 AND user_id=$2',
        [id, who, g.rules_version],
      );
    }),
  );
  app.post('/groups/:id/leave', (r) =>
    change(r, async (c, who, id, g) => {
      if (g.role === 'owner')
        throw new AuthError(409, 'Transfira a propriedade antes de sair.');
      if (g.member_status === 'banned')
        throw new AuthError(403, 'Participação banida.');
      await c.query(
        "UPDATE group_memberships SET status=CASE WHEN status='pending' THEN 'cancelled' ELSE 'removed' END,role='member',updated_at=now() WHERE group_id=$1 AND user_id=$2",
        [id, who],
      );
      await audit(c, id, who, 'leave', who);
    }),
  );
  for (const kind of ['members', 'join-requests'] as const)
    app.get(`/groups/:id/${kind}`, async (r) => {
      const who = user(r),
        id = gid(r),
        g = await context(db(), who, id);
      authorize(g, kind === 'members' ? 'read' : 'approve');
      const p = v.page(r.query),
        term = v
          .text((r.query as { q?: string }).q ?? '', 100)
          .replace(/[\\%_]/g, '\\$&');
      const rows = await db().query(
        `SELECT m.user_id AS id,m.user_id,m.role,m.status,m.joined_at,m.created_at,m.accepted_rules_version,u.username,u.display_name AS "displayName",EXISTS(SELECT 1 FROM group_member_restrictions x WHERE x.group_id=m.group_id AND x.user_id=m.user_id AND x.restriction_type='suspend' AND x.revoked_at IS NULL AND (x.expires_at IS NULL OR x.expires_at>now())) AS suspended FROM group_memberships m JOIN users u ON u.id=m.user_id JOIN privacy_settings ps ON ps.user_id=u.id WHERE m.group_id=$2 AND ${kind === 'join-requests' ? "m.status='pending'" : g.role === 'owner' || g.role === 'admin' || g.role === 'moderator' ? "m.status IN ('active','banned','removed')" : "m.status='active'"} AND u.account_status='active' AND ${notBlocked('u.id')} AND (${g.role === 'owner' || g.role === 'admin' ? 'true' : 'false'} OR u.id=$1 OR ps.profile_visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.followed_id=u.id AND f.status='approved')) AND (u.display_name ILIKE $3 OR u.username ILIKE $3) AND ($4::timestamptz IS NULL OR (m.created_at,m.user_id)<($4::timestamptz,$5::uuid)) ORDER BY m.created_at DESC,m.user_id DESC LIMIT $6`,
        [who, id, `%${term}%`, p.at, p.key, p.limit + 1],
      );
      return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
    });
  for (const decision of ['approve', 'reject'] as const)
    app.post(`/groups/:id/join-requests/:userId/${decision}`, (r) =>
      change(
        r,
        async (c, who, id, g) => {
          authorize(g, 'approve');
          const target = uid(r);
          const eligible = await c.query(
            `SELECT id FROM users u WHERE id=$2 AND account_status='active' AND ${notBlocked('u.id')} AND ${notBlocked('u.id', '$3')}`,
            [who, target, g.owner_id],
          );
          if (!eligible.rowCount) throw v.unavailable();
          const row = await c.query(
            "UPDATE group_memberships SET status=$3,joined_at=CASE WHEN $3='active' THEN now() END,updated_at=now() WHERE group_id=$1 AND user_id=$2 AND status='pending' RETURNING user_id",
            [id, target, decision === 'approve' ? 'active' : 'rejected'],
          );
          if (!row.rowCount)
            throw new AuthError(
              409,
              'Solicitação já analisada ou de outro grupo.',
            );
          await audit(c, id, who, decision, target);
        },
        [uid(r)],
      ),
    );
  app.patch('/groups/:id/members/:userId/role', (r) =>
    change(
      r,
      async (c, who, id, g) => {
        authorize(g, 'role');
        const target = uid(r),
          role = gv.choice(v.object(r.body).role, [
            'admin',
            'moderator',
            'member',
          ]);
        if (target === who)
          throw new AuthError(
            403,
            'Use transferência para alterar o proprietário.',
          );
        const t = await context(c, target, id);
        if (t.member_status !== 'active' || t.suspended)
          throw new AuthError(409, 'Selecione membro ativo sem suspensão.');
        await c.query(
          'UPDATE group_memberships SET role=$3,updated_at=now() WHERE group_id=$1 AND user_id=$2',
          [id, target, role],
        );
        await audit(c, id, who, `role:${role}`, target);
      },
      [uid(r)],
    ),
  );
  app.post('/groups/:id/transfer-ownership', (r) => {
    const target = v.id(v.object(r.body).userId);
    return change(
      r,
      async (c, who, id, g) => {
        authorize(g, 'transfer');
        if (v.object(r.body).confirm !== true || target === who)
          throw new AuthError(409, 'Confirme um novo proprietário.');
        const t = await context(c, target, id);
        if (t.member_status !== 'active' || t.suspended)
          throw new AuthError(
            409,
            'Destinatário precisa ser membro ativo sem suspensão.',
          );
        await c.query(
          "UPDATE group_memberships SET role='admin',updated_at=now() WHERE group_id=$1 AND user_id=$2",
          [id, who],
        );
        await c.query(
          "UPDATE group_memberships SET role='owner',updated_at=now() WHERE group_id=$1 AND user_id=$2",
          [id, target],
        );
        await c.query(
          'UPDATE groups SET owner_id=$2,updated_at=now() WHERE id=$1',
          [id, target],
        );
        await audit(c, id, who, 'transfer', target);
      },
      [target],
    );
  });
  for (const action of [
    'remove',
    'suspend',
    'ban',
    'unban',
    'unsuspend',
  ] as const) {
    const handler = (r: FastifyRequest) =>
      change(
        r,
        async (c, who, id, g) => {
          const target = uid(r),
            row = (
              await c.query<{ user_id: string; role: Role; status: string }>(
                'SELECT user_id,role,status FROM group_memberships WHERE group_id=$1 AND user_id=$2',
                [id, target],
              )
            ).rows[0];
          if (!row) throw v.unavailable();
          canManage(g, row);
          const reason = v.text(
            v.object(r.body ?? {}).reason ?? '',
            500,
            action === 'suspend' || action === 'ban' || action === 'remove',
          );
          if (action === 'unban') {
            if (row.status !== 'banned')
              throw new AuthError(409, 'Banimento não está ativo.');
            await c.query(
              "UPDATE group_memberships SET status='removed',role='member',updated_at=now() WHERE group_id=$1 AND user_id=$2",
              [id, target],
            );
          } else if (action !== 'unsuspend') {
            if (row.status === 'banned')
              throw new AuthError(
                409,
                'Revogue o banimento antes de aplicar outra medida.',
              );
            if (action !== 'suspend')
              await c.query(
                "UPDATE group_memberships SET status=$3,role='member',updated_at=now() WHERE group_id=$1 AND user_id=$2",
                [id, target, action === 'ban' ? 'banned' : 'removed'],
              );
            else if (row.status !== 'active')
              throw new AuthError(409, 'Suspensão exige membro ativo.');
            const expires =
              action === 'suspend'
                ? gv.expiry(v.object(r.body).expiresAt)
                : null;
            await c.query(
              'INSERT INTO group_member_restrictions(id,group_id,user_id,restriction_type,reason,applied_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
              [randomUUID(), id, target, action, reason, who, expires],
            );
          }
          if (action === 'unsuspend' || action === 'unban')
            await c.query(
              'UPDATE group_member_restrictions SET revoked_at=now() WHERE group_id=$1 AND user_id=$2 AND restriction_type=$3 AND revoked_at IS NULL',
              [id, target, action === 'unsuspend' ? 'suspend' : 'ban'],
            );
          await audit(c, id, who, action, target, reason);
        },
        [uid(r)],
      );
    if (action === 'remove') app.delete('/groups/:id/members/:userId', handler);
    else if (action === 'unban' || action === 'unsuspend')
      app.delete(
        `/groups/:id/members/:userId/${action === 'unban' ? 'ban' : 'suspend'}`,
        handler,
      );
    else app.post(`/groups/:id/members/:userId/${action}`, handler);
  }
  app.get('/groups/:id/audit', async (r) => {
    const who = user(r),
      id = gid(r),
      g = await context(db(), who, id);
    authorize(g, 'audit');
    const p = v.page(r.query);
    const rows = await db().query(
      'SELECT id,actor_id,action,target_id,reason,created_at FROM group_moderation_actions WHERE group_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4',
      [id, p.at, p.key, p.limit + 1],
    );
    return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
  });
  const reportGroup = `COALESCE(r.group_id,r.context_group_id,(SELECT s.group_id FROM social_posts s WHERE s.id=r.post_id),(SELECT s.group_id FROM social_post_comments c JOIN social_posts s ON s.id=c.post_id WHERE c.id=r.comment_id))`;
  app.get('/groups/:id/reports', async (r) => {
    const who = user(r),
      id = gid(r);
    authorize(await context(db(), who, id), 'moderate');
    const p = v.page(r.query);
    const rows = await db().query(
      `SELECT r.id,r.post_id,r.comment_id,r.group_member_id,r.reason,r.detail,r.escalation,r.created_at,EXISTS(SELECT 1 FROM group_moderation_actions a WHERE a.group_id=$1 AND a.target_id=r.id AND a.action='review-report') AS reviewed FROM social_reports r WHERE ${reportGroup}=$1 AND ($2::timestamptz IS NULL OR (r.created_at,r.id)<($2::timestamptz,$3::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT $4`,
      [id, p.at, p.key, p.limit + 1],
    );
    return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
  });
  app.post('/groups/:id/reports/:reportId/review', (r) =>
    change(r, async (c, who, id, g) => {
      authorize(g, 'moderate');
      const report = v.id((r.params as { reportId: string }).reportId);
      if (
        !(
          await c.query(
            `SELECT r.id FROM social_reports r WHERE r.id=$1 AND ${reportGroup}=$2`,
            [report, id],
          )
        ).rowCount
      )
        throw v.unavailable();
      await audit(
        c,
        id,
        who,
        'review-report',
        report,
        v.text(v.object(r.body).reason ?? '', 500),
      );
    }),
  );
  await invitations();
  async function invitations() {
    app.post('/groups/:id/invitations', async (r) => {
      let result: unknown;
      const b = v.object(r.body),
        target = b.userId == null ? null : v.id(b.userId),
        token = target ? null : secret();
      const limit = target ? 1 : Number(b.usageLimit ?? 1),
        expires = gv.expiry(b.expiresAt);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new AuthError(400, 'Limite de usos inválido.');
      await change(
        r,
        async (c, who, id, g) => {
          authorize(g, 'invite');
          if (target) {
            const t = await c.query(
              `SELECT u.id FROM users u WHERE u.id=$2 AND u.account_status='active' AND ${notBlocked('u.id')} AND NOT EXISTS(SELECT 1 FROM group_memberships m WHERE m.group_id=$3 AND m.user_id=u.id AND m.status IN ('active','banned'))`,
              [who, target, id],
            );
            if (!t.rowCount)
              throw new AuthError(409, 'Usuário inelegível para convite.');
          }
          const key = randomUUID();
          await c.query(
            'INSERT INTO group_invitations(id,group_id,invited_user_id,invited_by,token_hash,expires_at,usage_limit) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [
              key,
              id,
              target,
              who,
              token ? digest(token) : null,
              expires,
              limit,
            ],
          );
          await audit(c, id, who, 'invite', target);
          result = { id: key, token, expiresAt: expires, usageLimit: limit };
        },
        target ? [target] : [],
      );
      return { status: 'ok', invitation: result };
    });
    app.get('/groups/invitations/mine', async (r) => {
      const who = user(r),
        p = v.page(r.query);
      const rows = await db().query(
        `SELECT i.id,i.group_id,i.expires_at,i.created_at,g.name,g.rules,g.rules_version FROM group_invitations i JOIN groups g ON g.id=i.group_id WHERE i.invited_user_id=$1 AND i.status='pending' AND i.expires_at>now() AND i.usage_count<i.usage_limit AND g.status='active' AND ${groupEligible()} AND ${notBlocked('i.invited_by')} AND ($2::timestamptz IS NULL OR (i.created_at,i.id)<($2::timestamptz,$3::uuid)) ORDER BY i.created_at DESC,i.id DESC LIMIT $4`,
        [who, p.at, p.key, p.limit + 1],
      );
      return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
    });
    app.get('/groups/:id/invitations', async (r) => {
      const who = user(r),
        id = gid(r),
        g = await context(db(), who, id);
      authorize(g, 'invite');
      const p = v.page(r.query);
      const rows = await db().query(
        'SELECT id,invited_user_id,invited_by,expires_at,usage_limit,usage_count,status,created_at FROM group_invitations WHERE group_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) AND ($5::boolean OR invited_by=$6) ORDER BY created_at DESC,id DESC LIMIT $4',
        [
          id,
          p.at,
          p.key,
          p.limit + 1,
          g.role === 'owner' || g.role === 'admin',
          who,
        ],
      );
      return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
    });
    app.delete('/groups/:id/invitations/:invitationId', (r) =>
      change(r, async (c, who, id, g) => {
        authorize(g, 'invite');
        const key = v.id((r.params as { invitationId: string }).invitationId);
        const row = await c.query(
          "UPDATE group_invitations SET status='revoked' WHERE id=$1 AND group_id=$2 AND status='pending' AND ($3::boolean OR invited_by=$4) RETURNING id",
          [key, id, g.role === 'owner' || g.role === 'admin', who],
        );
        if (!row.rowCount) throw v.unavailable();
        await audit(c, id, who, 'revoke-invite', key);
      }),
    );
    // Tokens travel only in POST bodies; never in server URL logs.
    for (const action of ['preview', 'accept', 'reject'] as const)
      app.post(`/groups/invitations/:invitationId/${action}`, async (r) => {
        const who = user(r),
          key = v.id((r.params as { invitationId: string }).invitationId),
          b = v.object(r.body);
        let result: unknown;
        const found = (
          await db().query(
            'SELECT group_id,invited_by FROM group_invitations WHERE id=$1',
            [key],
          )
        ).rows[0];
        if (!found) throw v.unavailable();
        await transaction(db(), [who, found.invited_by], async (c) => {
          const g = await context(c, who, found.group_id, true, true);
          const inv = (
            await c.query(
              `SELECT i.*,i.expires_at<=now() AS expired,${notBlocked('i.invited_by')} AS eligible FROM group_invitations i WHERE i.id=$2 FOR UPDATE`,
              [who, key],
            )
          ).rows[0];
          if (
            !inv ||
            !inv.eligible ||
            (inv.invited_user_id
              ? inv.invited_user_id !== who
              : typeof b.token !== 'string' ||
                b.token.length !== 43 ||
                digest(b.token) !== inv.token_hash)
          )
            throw v.unavailable();
          if (
            inv.status !== 'pending' ||
            inv.expired ||
            inv.usage_count >= inv.usage_limit
          )
            throw new AuthError(
              410,
              'Convite expirado, revogado, recusado ou esgotado.',
            );
          if (action === 'preview') {
            result = (
              await c.query(`${groupSelect} WHERE g.id=$2`, [who, g.id])
            ).rows[0];
            return;
          }
          if (action === 'reject') {
            if (inv.invited_user_id)
              await c.query(
                "UPDATE group_invitations SET status='rejected' WHERE id=$1",
                [key],
              );
            else
              await c.query(
                'INSERT INTO group_invitation_uses(invitation_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
                [key, who],
              );
            return;
          }
          authorize(g, 'join');
          const inviter = await context(c, inv.invited_by, g.id);
          authorize(inviter, 'invite');
          gv.acceptance(b, g.rules_version);
          if (g.member_status === 'active')
            throw new AuthError(409, 'Você já participa deste grupo.');
          const used = await c.query(
            'INSERT INTO group_invitation_uses(invitation_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',
            [key, who],
          );
          if (!used.rowCount)
            throw new AuthError(
              409,
              'Convite já utilizado ou recusado por esta conta.',
            );
          // Only staff invitations replace prior approval; member invitations do not.
          const status =
            inviter.role === 'owner' ||
            inviter.role === 'admin' ||
            (g.privacy_type === 'public' && g.join_policy === 'immediate')
              ? 'active'
              : 'pending';
          await c.query(
            "INSERT INTO group_memberships(group_id,user_id,status,accepted_rules_version,joined_at) VALUES($1,$2,$4,$3,CASE WHEN $4='active' THEN now() END) ON CONFLICT(group_id,user_id) DO UPDATE SET status=$4,role='member',accepted_rules_version=$3,joined_at=CASE WHEN $4='active' THEN now() END,updated_at=now()",
            [g.id, who, g.rules_version, status],
          );
          await c.query(
            "UPDATE group_invitations SET usage_count=usage_count+1,status=CASE WHEN invited_user_id IS NOT NULL THEN 'accepted' ELSE status END WHERE id=$1",
            [key],
          );
          await audit(c, g.id, who, 'accept-invite', key);
        });
        return { status: 'ok', ...(result ? { group: result } : {}) };
      });
  }
}
