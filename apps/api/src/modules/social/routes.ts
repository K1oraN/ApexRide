import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { digest } from '../auth/security.js';
import { AuthError, username } from '../auth/validation.js';
import { LocalPhotoStorage, type PhotoStorage } from '../motorcycles/photos.js';
import { cleanupSocialMedia, queueMedia, uploadMedia } from './media.js';
import {
  follows,
  notBlocked,
  postAccess,
  postJoins,
  postSelect,
  profileAccess,
} from './policy.js';
import * as v from './validation.js';
import { authorize, context, groupVisible } from '../groups/policy.js';
import { audit } from '../groups/store.js';
import { visible as eventVisible } from '../events/policy.js';

export async function socialRoutes(
  app: FastifyInstance,
  options: {
    config: Config;
    pool?: Pool | undefined;
    storage?: PhotoStorage | undefined;
  },
) {
  const db = () => {
    if (!options.pool)
      throw new AuthError(503, 'Comunidade temporariamente indisponível.');
    return options.pool;
  };
  const principal = createPrincipal(options.config, db);
  const storage =
    options.storage ??
    new LocalPhotoStorage(join(options.config.motorcycleStorageDir, 'social'));
  const viewers = new WeakMap<FastifyRequest, string | null>();
  const viewer = (r: FastifyRequest) => viewers.get(r) ?? null;
  app.addHook('onRequest', sessionGuard(options.config));
  app.addHook('onRequest', async (r, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Vary', 'Cookie');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cross-Origin-Resource-Policy', 'same-site');
    const write = !['GET', 'HEAD'].includes(r.method);
    let user: string | null = null;
    try {
      user = (await principal(r, write)).user.id;
    } catch (error) {
      if (write || !(error instanceof AuthError && error.statusCode === 401))
        throw error;
    }
    viewers.set(r, user);
    // Shared PostgreSQL buckets, keyed by account on writes and hashed IP on reads.
    const action = write
      ? (r.routeOptions.url ?? r.url).replace(/:[a-z]+/g, 'id')
      : 'read';
    const max = write
      ? action.includes('media')
        ? 15
        : action.includes('reports')
          ? 10
          : action.endsWith('/posts')
            ? 10
            : 60
      : 180;
    const key = digest(`social:${user ?? r.ip}:${r.method}:${action}`);
    const count = await db().query(
      `INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+interval '1 minute' ELSE auth_rate_limits.expires_at END RETURNING attempts`,
      [key],
    );
    if (count.rows[0].attempts > max)
      throw new AuthError(
        429,
        'Limite de interações atingido. Aguarde um minuto.',
      );
  });
  const requireUser = (r: FastifyRequest) => {
    const u = viewer(r);
    if (!u) throw new AuthError(401, 'Entre na sua conta para continuar.');
    return u;
  };
  const param = (r: FastifyRequest) => v.id((r.params as { id: string }).id);
  async function transaction<T>(
    actors: string[],
    action: (c: PoolClient) => Promise<T>,
  ) {
    const c = await db().connect();
    try {
      await c.query('BEGIN');
      // Canonical account locks serialize block/follow/interaction races without a global lock.
      await c.query(
        'SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [[...new Set(actors)].sort()],
      );
      const result = await action(c);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }
  async function target(
    c: Pool | PoolClient,
    user: string | null,
    key: string,
  ) {
    const row = (
      await c.query(
        `SELECT u.id,u.username,u.display_name,ps.profile_visibility,${profileAccess()} AS accessible,${follows('u.id')} AS following, (SELECT status FROM social_follows WHERE follower_id=$1 AND followed_id=u.id) AS relationship FROM users u JOIN privacy_settings ps ON ps.user_id=u.id WHERE u.id=$2 AND u.account_status='active' AND ${notBlocked('u.id')}`,
        [user, key],
      )
    ).rows[0];
    if (!row) throw v.unavailable();
    return row;
  }
  async function accessible(
    c: Pool | PoolClient,
    user: string | null,
    key: string,
  ) {
    const row = (
      await c.query(
        `SELECT s.id,s.author_id,s.group_id ${postJoins} WHERE s.id=$2 AND ${postAccess}`,
        [user, key],
      )
    ).rows[0];
    if (!row) throw v.unavailable();
    return row as { id: string; author_id: string; group_id: string | null };
  }
  async function detail(user: string | null, key: string) {
    const row = (
      await db().query(`${postSelect} WHERE s.id=$2 AND ${postAccess}`, [
        user,
        key,
      ])
    ).rows[0];
    if (!row) throw v.unavailable();
    return row;
  }
  async function postMutation(
    r: FastifyRequest,
    action: (c: PoolClient, user: string, key: string) => Promise<unknown>,
  ) {
    const user = requireUser(r),
      key = param(r),
      s = await accessible(db(), user, key);
    return transaction([user, s.author_id], async (c) => {
      await accessible(c, user, key);
      if (s.group_id)
        authorize(await context(c, user, s.group_id, true), 'interact');
      return action(c, user, key);
    });
  }
  async function feed(
    r: FastifyRequest,
    kind: 'public' | 'following' | 'user',
  ) {
    const user = viewer(r),
      p = v.page(r.query);
    let author: string | null = null;
    if (kind === 'following') requireUser(r);
    if (kind === 'user') {
      const name = username((r.params as { username: string }).username);
      const row = (
        await db().query(
          "SELECT id FROM users WHERE username=$1 AND account_status='active'",
          [name],
        )
      ).rows[0];
      if (!row) throw v.unavailable();
      author = row.id;
      const profile = await target(db(), user, author!);
      if (!profile.accessible)
        throw new AuthError(
          403,
          'Perfil privado. Solicite seguir e aguarde aprovação.',
        );
    }
    const rows = await db().query(
      `${postSelect} WHERE s.group_id IS NULL AND ${postAccess} AND ($2::timestamptz IS NULL OR (s.created_at,s.id)<($2::timestamptz,$3::uuid)) AND ${kind === 'public' ? "s.visibility='public' AND ps.profile_visibility='public'" : kind === 'following' ? follows('s.author_id') : 's.author_id=$5::uuid'} ORDER BY s.created_at DESC,s.id DESC LIMIT $4`,
      [user, p.at, p.key, p.limit + 1, ...(kind === 'user' ? [author] : [])],
    );
    return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
  }
  app.get('/social/feed', (r) => feed(r, 'public'));
  app.get('/social/feed/following', (r) => feed(r, 'following'));
  app.get('/social/users/:username/posts', (r) => feed(r, 'user'));
  app.get('/social/posts/:id', async (r) => ({
    status: 'ok',
    post: await detail(viewer(r), param(r)),
  }));

  async function savePost(
    c: PoolClient,
    user: string,
    key: string,
    b: ReturnType<typeof v.postInput>,
    edit: boolean,
    groupId: string | null = null,
  ) {
    let groupPrivate = false;
    if (edit) {
      const row = (
        await c.query(
          'SELECT author_id,status,group_id,group_private FROM social_posts WHERE id=$1',
          [key],
        )
      ).rows[0];
      if (!row || row.author_id !== user || row.status !== 'published')
        throw v.unavailable();
      groupId = row.group_id;
      groupPrivate = row.group_private;
    }
    if (groupId) {
      const g = await context(c, user, groupId, true);
      authorize(g, 'post');
      groupPrivate = groupPrivate || g.privacy_type === 'private';
      b.visibility = 'public';
    }
    await c.query('SELECT pg_advisory_xact_lock(180017)');
    if (
      b.motorcycleId &&
      !(
        await c.query(
          'SELECT id FROM motorcycles WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR SHARE',
          [b.motorcycleId, user],
        )
      ).rowCount
    )
      throw new AuthError(400, 'Selecione uma moto própria e ativa.');
    if (
      b.rideId &&
      !(
        await c.query(
          "SELECT id FROM rides WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND visibility='public' FOR SHARE",
          [b.rideId, user],
        )
      ).rowCount
    )
      throw new AuthError(
        400,
        'O Ride precisa ser seu, estar sincronizado e público. Altere a privacidade no Histórico conscientemente antes de compartilhar.',
      );
    const media = await c.query(
      "SELECT id,post_id FROM social_post_media WHERE id=ANY($1::uuid[]) AND owner_id=$2 AND group_id IS NULL AND event_id IS NULL AND (post_id IS NULL OR post_id=$3) AND (post_id IS NOT NULL OR created_at>now()-interval '1 hour') ORDER BY id FOR UPDATE",
      [b.mediaIds, user, key],
    );
    if (
      b.achievementCode &&
      !(
        await c.query(
          "SELECT 1 FROM user_achievements a JOIN achievement_definitions d ON d.code=a.achievement_code WHERE a.user_id=$1 AND a.achievement_code=$2 AND a.status='unlocked' AND d.enabled",
          [user, b.achievementCode],
        )
      ).rowCount
    )
      throw new AuthError(400, 'Conquista indisponível para compartilhar.');
    if (media.rowCount !== b.mediaIds.length)
      throw new AuthError(
        400,
        'Fotografia inválida, expirada ou de outra publicação.',
      );
    if (edit) {
      await queueMedia(c, key, b.mediaIds);
      // Free positions before a reorder; the final state stays within 0..4.
      await c.query(
        'UPDATE social_post_media SET post_id=NULL WHERE post_id=$1',
        [key],
      );
      await c.query(
        'UPDATE social_posts SET text=$1,visibility=$2,motorcycle_id=$3,ride_id=$4,updated_at=now() WHERE id=$5',
        [b.text, b.visibility, b.motorcycleId, b.rideId, key],
      );
    } else
      await c.query(
        'INSERT INTO social_posts(id,author_id,text,visibility,motorcycle_id,ride_id,group_id,group_private) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          key,
          user,
          b.text,
          b.visibility,
          b.motorcycleId,
          b.rideId,
          groupId,
          groupPrivate,
        ],
      );
    await c.query('UPDATE social_posts SET achievement_code=$2 WHERE id=$1', [
      key,
      b.achievementCode,
    ]);
    for (const [position, id] of b.mediaIds.entries())
      await c.query(
        'UPDATE social_post_media SET post_id=$1,position=$2 WHERE id=$3',
        [key, position, id],
      );
  }
  app.post('/social/posts', async (r, reply) => {
    const user = requireUser(r),
      key = randomUUID(),
      b = v.postInput(r.body);
    await transaction([user], (c) => savePost(c, user, key, b, false));
    return reply
      .code(201)
      .send({ status: 'ok', post: await detail(user, key) });
  });
  app.get('/groups/:id/posts', async (r) => {
    const user = viewer(r),
      key = param(r),
      p = v.page(r.query);
    const rows = await db().query(
      `${postSelect} WHERE s.group_id=$2 AND ${postAccess} AND ($3::timestamptz IS NULL OR (s.created_at,s.id)<($3::timestamptz,$4::uuid)) ORDER BY s.created_at DESC,s.id DESC LIMIT $5`,
      [user, key, p.at, p.key, p.limit + 1],
    );
    const g = await db().query(
      `SELECT g.id,g.privacy_type FROM groups g WHERE g.id=$2 AND ${groupVisible()}`,
      [user, key],
    );
    if (!g.rowCount) throw v.unavailable();
    if (g.rows[0].privacy_type === 'private') {
      if (!user) throw new AuthError(403, 'Grupo privado.');
      authorize(await context(db(), user, key), 'read');
    }
    return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
  });
  app.post('/groups/:id/posts', async (r, reply) => {
    const user = requireUser(r),
      key = randomUUID(),
      b = v.postInput(r.body),
      group = param(r);
    await transaction([user], (c) => savePost(c, user, key, b, false, group));
    return reply
      .code(201)
      .send({ status: 'ok', post: await detail(user, key) });
  });
  for (const kind of ['posts', 'comments'] as const)
    app.post(`/groups/:id/moderate/${kind}/:contentId`, async (r) => {
      const user = requireUser(r),
        group = param(r),
        key = v.id((r.params as { contentId: string }).contentId),
        reason = v.text(v.object(r.body).reason, 500, true);
      await transaction([user], async (c) => {
        authorize(await context(c, user, group, true), 'moderate');
        const row = await c.query(
          kind === 'posts'
            ? "UPDATE social_posts SET status='restricted',updated_at=now() WHERE id=$1 AND group_id=$2 AND status='published' RETURNING id"
            : "UPDATE social_post_comments SET status='restricted' WHERE id=$1 AND status='published' AND post_id IN (SELECT id FROM social_posts WHERE group_id=$2) RETURNING id",
          [key, group],
        );
        if (!row.rowCount) throw v.unavailable();
        await audit(c, group, user, `hide-${kind}`, key, reason);
      });
      return { status: 'ok' };
    });
  app.patch('/social/posts/:id', async (r) => {
    const user = requireUser(r),
      key = param(r),
      b = v.postInput(r.body);
    await transaction([user], (c) => savePost(c, user, key, b, true));
    return { status: 'ok', post: await detail(user, key) };
  });
  app.delete('/social/posts/:id', async (r) => {
    const user = requireUser(r),
      key = param(r);
    await transaction([user], async (c) => {
      const post = (
        await c.query(
          'SELECT group_id FROM social_posts WHERE id=$1 AND author_id=$2',
          [key, user],
        )
      ).rows[0];
      if (post?.group_id)
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,19))', [
          post.group_id,
        ]);
      await c.query('SELECT pg_advisory_xact_lock(180017)');
      const row = await c.query(
        "UPDATE social_posts SET status='deleted',deleted_at=now(),updated_at=now() WHERE id=$1 AND author_id=$2 AND status='published' RETURNING id",
        [key, user],
      );
      if (!row.rowCount) throw v.unavailable();
      await queueMedia(c, key);
    });
    return { status: 'ok' };
  });
  for (const method of ['post', 'delete'] as const)
    app[method]('/social/posts/:id/like', async (r) => {
      await postMutation(r, async (c, user, key) => {
        if (method === 'post')
          await c.query(
            'INSERT INTO social_post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [key, user],
          );
        else
          await c.query(
            'DELETE FROM social_post_likes WHERE post_id=$1 AND user_id=$2',
            [key, user],
          );
      });
      return { status: 'ok', post: await detail(viewer(r), param(r)) };
    });
  app.get('/social/posts/:id/comments', async (r) => {
    const user = viewer(r),
      key = param(r),
      p = v.page(r.query);
    await accessible(db(), user, key);
    const rows = await db().query(
      `SELECT c.id,c.text,c.created_at,jsonb_build_object('id',u.id,'username',u.username,'displayName',u.display_name) AS author FROM social_post_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$2 AND c.status='published' AND u.account_status='active' AND ${notBlocked('c.author_id')} AND EXISTS(SELECT 1 ${postJoins} WHERE s.id=c.post_id AND ${postAccess}) AND ($3::timestamptz IS NULL OR (c.created_at,c.id)<($3::timestamptz,$4::uuid)) ORDER BY c.created_at DESC,c.id DESC LIMIT $5`,
      [user, key, p.at, p.key, p.limit + 1],
    );
    return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
  });
  app.post('/social/posts/:id/comments', async (r, reply) => {
    const text = v.text(v.object(r.body).text, v.SOCIAL_LIMITS.comment, true),
      key = randomUUID();
    await postMutation(r, (c, user, post) =>
      c.query(
        'INSERT INTO social_post_comments(id,post_id,author_id,text) VALUES($1,$2,$3,$4)',
        [key, post, user, text],
      ),
    );
    return reply.code(201).send({ status: 'ok', id: key });
  });
  app.delete('/social/comments/:id', async (r) => {
    const user = requireUser(r),
      key = param(r);
    const comment = (
      await db().query(
        "SELECT post_id FROM social_post_comments WHERE id=$1 AND author_id=$2 AND status='published'",
        [key, user],
      )
    ).rows[0];
    if (!comment) throw v.unavailable();
    await transaction([user], async (c) => {
      await c.query(
        "UPDATE social_post_comments SET status='deleted' WHERE id=$1 AND author_id=$2",
        [key, user],
      );
    });
    return { status: 'ok' };
  });

  app.get('/social/users/:username', async (r) => {
    const user = viewer(r),
      name = username((r.params as { username: string }).username);
    const record = (
      await db().query('SELECT id FROM users WHERE username=$1', [name])
    ).rows[0];
    if (!record) throw v.unavailable();
    const t = await target(db(), user, record.id);
    const info = (
      await db().query(
        `SELECT p.biography,p.city,p.state,
      (SELECT count(*)::int FROM social_follows f JOIN users fu ON fu.id=f.follower_id WHERE f.followed_id=$2 AND f.status='approved' AND fu.account_status='active' AND ${notBlocked('f.follower_id')}) AS followers,
      (SELECT count(*)::int FROM social_follows f JOIN users fu ON fu.id=f.followed_id WHERE f.follower_id=$2 AND f.status='approved' AND fu.account_status='active' AND ${notBlocked('f.followed_id')}) AS following_count
      FROM profiles p WHERE p.user_id=$2`,
        [user, t.id],
      )
    ).rows[0];
    return {
      status: 'ok',
      profile: {
        id: t.id,
        username: t.username,
        displayName: t.display_name,
        visibility: t.profile_visibility,
        accessible: t.accessible,
        relationship: t.relationship ?? 'none',
        ...(t.accessible
          ? {
              biography: info.biography,
              city: info.city,
              state: info.state,
              followers: info.followers,
              following: info.following_count,
            }
          : { followers: null, following: null }),
      },
    };
  });
  app.get('/social/users/search', async (r) => {
    const user = viewer(r),
      q = r.query as { q?: string },
      p = v.page(r.query),
      term = v.text(q.q ?? '', 80, true);
    const escaped = term.toLowerCase().replace(/[\\%_]/g, '\\$&');
    const rows = await db().query(
      `SELECT u.id,u.username,u.display_name AS "displayName",u.created_at,to_char(u.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,${profileAccess()} AS accessible,(SELECT status FROM social_follows WHERE follower_id=$1 AND followed_id=u.id) AS relationship FROM users u JOIN privacy_settings ps ON ps.user_id=u.id JOIN profiles p ON p.user_id=u.id WHERE u.account_status='active' AND ${notBlocked('u.id')} AND (lower(u.username) LIKE $2 OR lower(u.display_name) LIKE $2 OR (ps.profile_visibility='public' AND (lower(p.city) LIKE $2 OR lower(p.state) LIKE $2))) AND ($3::timestamptz IS NULL OR (u.created_at,u.id)<($3::timestamptz,$4::uuid)) ORDER BY u.created_at DESC,u.id DESC LIMIT $5`,
      [user, `${escaped}%`, p.at, p.key, p.limit + 1],
    );
    // Existing users have microsecond timestamps: preserve exact cursor timestamp below.
    return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
  });
  for (const method of ['post', 'delete'] as const)
    app[method]('/social/users/:id/follow', async (r) => {
      const user = requireUser(r),
        key = param(r);
      if (key === user)
        throw new AuthError(400, 'Não é possível seguir a si mesmo.');
      const result = await transaction([user, key], async (c) => {
        const t = await target(c, user, key);
        if (method === 'delete') {
          await c.query(
            'DELETE FROM social_follows WHERE follower_id=$1 AND followed_id=$2',
            [user, key],
          );
          return 'none';
        }
        const status =
          t.profile_visibility === 'private' ? 'pending' : 'approved';
        const row = await c.query(
          "INSERT INTO social_follows(follower_id,followed_id,status,approved_at) VALUES($1,$2,$3,CASE WHEN $3='approved' THEN now() END) ON CONFLICT(follower_id,followed_id) DO UPDATE SET status=social_follows.status RETURNING status",
          [user, key, status],
        );
        return row.rows[0].status;
      });
      return { status: 'ok', relationship: result };
    });
  app.get('/social/requests', async (r) => {
    const user = requireUser(r),
      p = v.page(r.query);
    const rows = await db().query(
      `SELECT u.id,u.username,u.display_name AS "displayName",f.created_at FROM social_follows f JOIN users u ON u.id=f.follower_id WHERE f.followed_id=$1 AND f.status='pending' AND u.account_status='active' AND ${notBlocked('u.id')} AND ($2::timestamptz IS NULL OR (f.created_at,u.id)<($2::timestamptz,$3::uuid)) ORDER BY f.created_at DESC,u.id DESC LIMIT $4`,
      [user, p.at, p.key, p.limit + 1],
    );
    return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
  });
  app.post('/social/requests/:id/approve', async (r) => {
    const user = requireUser(r),
      key = param(r);
    await transaction([user, key], async (c) => {
      await target(c, user, key);
      const row = await c.query(
        "UPDATE social_follows SET status='approved',approved_at=now() WHERE follower_id=$1 AND followed_id=$2 AND status='pending' RETURNING follower_id",
        [key, user],
      );
      if (!row.rowCount) throw v.unavailable();
    });
    return { status: 'ok' };
  });
  app.delete('/social/requests/:id', async (r) => {
    const user = requireUser(r),
      key = param(r);
    await transaction([user, key], (c) =>
      c.query(
        "DELETE FROM social_follows WHERE follower_id=$1 AND followed_id=$2 AND status='pending'",
        [key, user],
      ),
    );
    return { status: 'ok' };
  });
  app.delete('/social/followers/:id', async (r) => {
    const user = requireUser(r),
      key = param(r);
    await transaction([user, key], (c) =>
      c.query(
        'DELETE FROM social_follows WHERE follower_id=$1 AND followed_id=$2',
        [key, user],
      ),
    );
    return { status: 'ok' };
  });
  for (const kind of ['followers', 'following'] as const)
    app.get(`/social/users/:id/${kind}`, async (r) => {
      const user = viewer(r),
        key = param(r),
        p = v.page(r.query),
        t = await target(db(), user, key);
      if (!t.accessible) throw new AuthError(403, 'Lista de perfil privado.');
      const col = kind === 'followers' ? 'follower_id' : 'followed_id',
        other = kind === 'followers' ? 'followed_id' : 'follower_id';
      const rows = await db().query(
        `SELECT u.id,u.username,u.display_name AS "displayName",f.created_at,(SELECT status FROM social_follows WHERE follower_id=$1 AND followed_id=u.id) AS relationship FROM social_follows f JOIN users u ON u.id=f.${col} WHERE f.${other}=$2 AND f.status='approved' AND u.account_status='active' AND ${notBlocked('u.id')} AND ($3::timestamptz IS NULL OR (f.created_at,u.id)<($3::timestamptz,$4::uuid)) ORDER BY f.created_at DESC,u.id DESC LIMIT $5`,
        [user, key, p.at, p.key, p.limit + 1],
      );
      return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
    });
  app.post('/social/blocks/:id', async (r) => {
    const user = requireUser(r),
      key = param(r);
    if (user === key)
      throw new AuthError(400, 'Não é possível bloquear a si mesmo.');
    await transaction([user, key], async (c) => {
      if (
        !(
          await c.query(
            "SELECT id FROM users WHERE id=$1 AND account_status='active'",
            [key],
          )
        ).rowCount
      )
        throw v.unavailable();
      await c.query(
        'INSERT INTO social_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [user, key],
      );
      await c.query(
        'DELETE FROM social_follows WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)',
        [user, key],
      );
    });
    return { status: 'ok' };
  });
  app.delete('/social/blocks/:id', async (r) => {
    const user = requireUser(r),
      key = param(r);
    await transaction([user, key], (c) =>
      c.query(
        'DELETE FROM social_blocks WHERE blocker_id=$1 AND blocked_id=$2',
        [user, key],
      ),
    );
    return { status: 'ok' };
  });
  app.get('/social/blocks', async (r) => {
    const user = requireUser(r),
      p = v.page(r.query);
    const rows = await db().query(
      'SELECT u.id,u.username,u.display_name AS "displayName",b.created_at FROM social_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 AND ($2::timestamptz IS NULL OR (b.created_at,u.id)<($2::timestamptz,$3::uuid)) ORDER BY b.created_at DESC,u.id DESC LIMIT $4',
      [user, p.at, p.key, p.limit + 1],
    );
    return { status: 'ok', ...v.paginated(rows.rows, p.limit) };
  });
  app.post('/social/reports', async (r, reply) => {
    const user = requireUser(r),
      b = v.object(r.body),
      key = v.id(b.id),
      kind = b.kind;
    if (
      ![
        'post',
        'comment',
        'profile',
        'group',
        'group_member',
        'photo',
        'event',
        'route',
        'circuit',
      ].includes(String(kind)) ||
      ![
        'harassment',
        'offensive',
        'spam',
        'fraud',
        'personal_data',
        'dangerous',
        'other',
      ].includes(String(b.reason))
    )
      throw new AuthError(400, 'Denúncia inválida.');
    const detail = v.text(b.detail ?? '', 500);
    if (kind === 'post') await accessible(db(), user, key);
    else if (kind === 'photo') {
      const media = (
        await db().query(
          'SELECT post_id FROM social_post_media WHERE id=$1 AND post_id IS NOT NULL',
          [key],
        )
      ).rows[0];
      if (!media) throw v.unavailable();
      await accessible(db(), user, media.post_id);
    } else if (kind === 'event') {
      if (
        !(
          await db().query(
            `SELECT 1 FROM social_events e WHERE e.id=$2 AND ${eventVisible()}`,
            [user, key],
          )
        ).rowCount
      )
        throw v.unavailable();
    } else if (kind === 'route' || kind === 'circuit') {
      if (
        !(
          await db().query(
            "SELECT 1 FROM routes WHERE id=$1 AND status='approved' AND kind=$2",
            [key, kind],
          )
        ).rowCount
      )
        throw v.unavailable();
    } else if (kind === 'profile') await target(db(), user, key);
    else if (kind === 'group') await context(db(), user, key);
    else if (kind === 'group_member') {
      const group = v.id(b.groupId);
      authorize(await context(db(), user, group), 'read');
      if (
        !(
          await db().query(
            "SELECT user_id FROM group_memberships WHERE group_id=$1 AND user_id=$2 AND status='active'",
            [group, key],
          )
        ).rowCount
      )
        throw v.unavailable();
    } else {
      const row = (
        await db().query(
          `SELECT c.post_id FROM social_post_comments c JOIN users u ON u.id=c.author_id WHERE c.id=$2 AND c.status='published' AND u.account_status='active' AND ${notBlocked('c.author_id')}`,
          [user, key],
        )
      ).rows[0];
      if (!row) throw v.unavailable();
      await accessible(db(), user, row.post_id);
    }
    const column =
      kind === 'photo'
        ? 'media_id'
        : kind === 'event'
          ? 'event_id'
          : ['route', 'circuit'].includes(String(kind))
            ? 'route_id'
            : kind === 'post'
              ? 'post_id'
              : kind === 'comment'
                ? 'comment_id'
                : kind === 'group'
                  ? 'group_id'
                  : kind === 'group_member'
                    ? 'group_member_id'
                    : 'profile_id';
    const row = await db().query(
      `INSERT INTO social_reports(id,reporter_id,${column},reason,detail,context_group_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
      [
        randomUUID(),
        user,
        key,
        b.reason,
        detail,
        kind === 'group_member' ? v.id(b.groupId) : null,
      ],
    );
    if (!row.rowCount)
      throw new AuthError(409, 'Você já denunciou este conteúdo.');
    return reply
      .code(201)
      .send({ status: 'ok', message: 'Denúncia recebida para análise.' });
  });

  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: v.SOCIAL_LIMITS.photoBytes },
    (_r, body, done) => done(null, body),
  );
  app.post(
    '/social/media',
    { bodyLimit: v.SOCIAL_LIMITS.photoBytes },
    async (r, reply) => {
      const user = requireUser(r);
      try {
        const media = await uploadMedia(db(), storage, user, r.body);
        return reply.code(201).send({ status: 'ok', media });
      } catch (error) {
        if (error instanceof AuthError) throw error;
        throw new AuthError(
          503,
          'Falha ao armazenar fotografia. Seu texto foi preservado; tente novamente.',
        );
      }
    },
  );
  app.delete('/social/media/:id', async (r) => {
    const user = requireUser(r),
      key = param(r);
    await transaction([user], async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(180017)');
      const row = (
        await c.query(
          'DELETE FROM social_post_media WHERE id=$1 AND owner_id=$2 AND post_id IS NULL AND group_id IS NULL AND event_id IS NULL RETURNING file_ref,thumbnail_ref',
          [key, user],
        )
      ).rows[0];
      if (!row) throw v.unavailable();
      for (const file of [row.file_ref, row.thumbnail_ref])
        await c.query(
          'INSERT INTO social_media_cleanup(file_ref) VALUES($1) ON CONFLICT(file_ref) DO UPDATE SET available_at=now()',
          [file],
        );
    });
    return { status: 'ok' };
  });
  app.get('/social/media/:id', async (r, reply) => {
    const user = viewer(r),
      key = param(r);
    const row = (
      await db().query(
        `SELECT m.file_ref,m.thumbnail_ref,m.post_id,m.owner_id FROM social_post_media m WHERE m.id=$2 AND NOT EXISTS(SELECT 1 FROM admin_content_states ax WHERE ax.target_type='photo' AND ax.target_id=m.id) AND ((m.post_id IS NULL AND m.group_id IS NULL AND m.event_id IS NULL AND m.owner_id=$1 AND m.created_at>now()-interval '1 hour') OR EXISTS(SELECT 1 FROM groups g WHERE g.id=m.group_id AND ${groupVisible()}) OR EXISTS(SELECT 1 FROM social_events e WHERE e.id=m.event_id AND ${eventVisible()}) OR EXISTS(SELECT 1 ${postJoins} WHERE s.id=m.post_id AND ${postAccess}))`,
        [user, key],
      )
    ).rows[0];
    if (!row) throw v.unavailable();
    let bytes: Buffer;
    try {
      bytes = await storage.get(
        (r.query as { size?: string }).size === 'thumb'
          ? row.thumbnail_ref
          : row.file_ref,
      );
    } catch {
      throw new AuthError(503, 'Fotografia temporariamente indisponível.');
    }
    return reply.type('image/webp').send(bytes);
  });
  app.patch('/groups/:id/images', async (r) => {
    const user = requireUser(r),
      group = param(r),
      b = v.object(r.body);
    if (Object.keys(b).some((k) => !['avatar', 'cover'].includes(k)))
      throw new AuthError(400, 'Imagem inválida.');
    await transaction([user], async (c) => {
      authorize(await context(c, user, group, true), 'edit');
      await c.query('SELECT pg_advisory_xact_lock(180017)');
      for (const slot of ['avatar', 'cover']) {
        if (!(slot in b)) continue;
        const key = b[slot] === null ? null : v.id(b[slot]);
        if (
          key &&
          (
            await c.query(
              'SELECT id FROM social_post_media WHERE id=$1 AND owner_id=$2 AND group_id=$3 AND group_slot=$4',
              [key, user, group, slot],
            )
          ).rowCount
        )
          continue;
        if (
          key &&
          !(
            await c.query(
              "SELECT id FROM social_post_media WHERE id=$1 AND owner_id=$2 AND post_id IS NULL AND group_id IS NULL AND event_id IS NULL AND created_at>now()-interval '1 hour' FOR UPDATE",
              [key, user],
            )
          ).rowCount
        )
          throw new AuthError(400, 'Foto inválida ou já associada.');
        const old = await c.query(
          'DELETE FROM social_post_media WHERE group_id=$1 AND group_slot=$2 RETURNING file_ref,thumbnail_ref',
          [group, slot],
        );
        for (const m of old.rows)
          for (const file of [m.file_ref, m.thumbnail_ref])
            await c.query(
              'INSERT INTO social_media_cleanup(file_ref) VALUES($1) ON CONFLICT(file_ref) DO UPDATE SET available_at=now()',
              [file],
            );
        if (key)
          await c.query(
            'UPDATE social_post_media SET group_id=$2,group_slot=$3 WHERE id=$1',
            [key, group, slot],
          );
      }
      await audit(c, group, user, 'images');
    });
    return { status: 'ok' };
  });
  app.get('/social/rides/:id/preview', async (r) => {
    const user = requireUser(r),
      key = param(r);
    const row = (
      await db().query(
        "SELECT r.id,r.mode,to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') AS day,round((r.distance_meters/1000)::numeric,1) AS \"distanceKm\",round(r.active_ms/60000.0) AS \"activeMinutes\" FROM rides r JOIN privacy_settings ps ON ps.user_id=r.owner_id WHERE r.id=$1 AND r.owner_id=$2 AND r.visibility='public' AND r.deleted_at IS NULL AND ps.profile_visibility='public'",
        [key, user],
      )
    ).rows[0];
    if (!row)
      throw new AuthError(
        400,
        'Resumo indisponível. Confira a privacidade do Ride e do perfil no Histórico e nas configurações.',
      );
    return {
      status: 'ok',
      summary: { ...row, locationPolicy: 'summary-only-v1' },
    };
  });
  let cleaning: Promise<void> | undefined;
  const clean = () => {
    if (!options.pool) return;
    cleaning ??= cleanupSocialMedia(options.pool, storage)
      .catch(() => {
        app.log.error(
          { event: 'social_media_cleanup_failed' },
          'Limpeza de mídia pendente',
        );
      })
      .finally(() => {
        cleaning = undefined;
      });
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    clean();
    timer = setInterval(clean, 60000);
    timer.unref();
  });
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await cleaning;
  });
}
