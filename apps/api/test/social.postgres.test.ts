import { randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { cleanupSocialMedia } from '../src/modules/social/media.js';
import type { PhotoStorage } from '../src/modules/motorcycles/photos.js';
import { postSelect, postAccess } from '../src/modules/social/policy.js';
const url = process.env.TEST_DATABASE_URL,
  schema = `social_test_${randomUUID().replaceAll('-', '')}`;
let admin: pg.Pool, pool: pg.Pool, app: FastifyInstance;
type Session = { id: string; cookie: string; csrf: string };
let alice: Session, bob: Session, charlie: Session;
const files = new Map<string, Buffer>();
let failPut = false,
  failGet = false,
  failRemove = false;
const storage: PhotoStorage = {
  put: async (k, b) => {
    if (failPut) throw new Error('storage failure');
    files.set(k, b);
  },
  get: async (k) => {
    if (failGet || !files.has(k)) throw new Error('missing');
    return files.get(k)!;
  },
  remove: async (k) => {
    if (failRemove) throw new Error('storage failure');
    files.delete(k);
  },
};
function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  s?: Session,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method,
    url: '/api' + path,
    headers: {
      origin: 'http://127.0.0.1:5173',
      'x-apex-request': '1',
      ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}),
      ...headers,
    },
    ...(payload === undefined
      ? {}
      : { payload: payload as Record<string, unknown> }),
  });
}
async function account(name: string) {
  expect(
    (
      await call('POST', '/auth/register', {
        displayName: name,
        username: name,
        email: `${name}@example.com`,
        password: 'frase de senha longa e segura',
        acceptTerms: true,
        termsVersion: 'prelaunch-draft',
        privacyVersion: 'prelaunch-draft',
      })
    ).statusCode,
  ).toBe(201);
  const r = await call('POST', '/auth/login', {
    email: `${name}@example.com`,
    password: 'frase de senha longa e segura',
  });
  return {
    id: r.json().user.id,
    cookie: String(r.headers['set-cookie']).split(';')[0]!,
    csrf: r.json().csrfToken,
  };
}
async function post(s = alice, body: Record<string, unknown> = {}) {
  const r = await call(
    'POST',
    '/social/posts',
    { text: 'Passeio tranquilo', visibility: 'public', ...body },
    s,
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json().post;
}
async function bike(s = alice) {
  const r = await call(
    'POST',
    '/motorcycles',
    { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
    s,
  );
  return r.json().motorcycle.id as string;
}
async function ride(s = alice, visibility = 'public') {
  const start = Date.now() - 60000;
  const r = await call(
    'POST',
    '/rides',
    {
      clientId: randomUUID(),
      motorcycleId: await bike(s),
      mode: 'misto',
      visibility,
      startedAt: start,
      endedAt: start + 10000,
      intervals: [{ start, end: start + 10000 }],
      points: [0, 1, 2].map((i) => ({
        longitude: -35.735 + i * 0.0001,
        latitude: -9.665,
        timestamp: start + i * 1000,
        accuracy: 5,
        speed: 10,
        heading: 90,
        altitude: null,
        segment: 0,
      })),
    },
    s,
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}
async function photo(s = alice, format: 'jpeg' | 'png' | 'webp' = 'jpeg') {
  const bytes = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#ff202d' },
  })
    .toFormat(format)
    .withMetadata({ exif: { IFD0: { Artist: 'Private rider' } } })
    .toBuffer();
  const r = await call('POST', '/social/media', bytes, s, {
    'content-type': `image/${format}`,
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().media;
}
describe.skipIf(!url)('Parte 18 social PostgreSQL', () => {
  beforeAll(async () => {
    const config = parseEnv({
        NODE_ENV: 'test',
        DATABASE_URL: url,
        DATABASE_SSL: process.env.DATABASE_SSL ?? 'disable',
      }),
      options = {
        connectionString: config.databaseUrl,
        ssl:
          config.databaseSsl === 'verify-full'
            ? { rejectUnauthorized: true }
            : false,
      };
    admin = new pg.Pool(options);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({
      ...options,
      options: `-c search_path=${schema},public`,
    });
    await migrate(pool);
    app = await buildApp({
      config,
      logger: false,
      database: { pool, check: async () => {}, close: async () => {} },
      socialStorage: storage,
    });
    await app.ready();
    alice = await account('social_alice');
    bob = await account('social_bob');
    charlie = await account('social_charlie');
  }, 30000);
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE social_reports,social_post_comments,social_post_likes,social_post_media,social_posts,social_follows,social_blocks,social_media_cleanup,auth_rate_limits CASCADE',
    );
    await pool.query("UPDATE privacy_settings SET profile_visibility='public'");
    files.clear();
    failPut = failGet = failRemove = false;
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it('18A public follows are idempotent, counted and cannot target self', async () => {
    for (let n = 0; n < 2; n++)
      expect(
        (await call('POST', `/social/users/${alice.id}/follow`, {}, bob)).json()
          .relationship,
      ).toBe('approved');
    const p = (
      await call('GET', '/social/users/social_alice', undefined, bob)
    ).json().profile;
    expect(p).toMatchObject({
      followers: 1,
      following: 0,
      relationship: 'approved',
    });
    expect(JSON.stringify(p)).not.toMatch(/email|password|phone|latitude/);
    expect(
      (await call('POST', `/social/users/${bob.id}/follow`, {}, bob))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call('GET', `/social/users/${alice.id}/followers`, undefined, bob)
      ).json().items[0].id,
    ).toBe(bob.id);
    await call('DELETE', `/social/users/${alice.id}/follow`, undefined, bob);
    expect(
      (await call('GET', '/social/users/social_alice')).json().profile
        .followers,
    ).toBe(0);
  });
  it('18A pending does not grant access, approval does, removal revokes immediately', async () => {
    await pool.query(
      "UPDATE privacy_settings SET profile_visibility='private' WHERE user_id=$1",
      [alice.id],
    );
    const p = await post();
    expect(
      (await call('POST', `/social/users/${alice.id}/follow`, {}, bob)).json()
        .relationship,
    ).toBe('pending');
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/social/users/social_alice', undefined, bob)).json()
        .profile,
    ).toMatchObject({ accessible: false, followers: null });
    expect(
      (await call('GET', `/social/users/${alice.id}/followers`, undefined, bob))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('GET', '/social/requests', undefined, alice)).json().items[0]
        .id,
    ).toBe(bob.id);
    expect(
      (await call('POST', `/social/requests/${bob.id}/approve`, {}, charlie))
        .statusCode,
    ).toBe(404);
    await call('POST', `/social/requests/${bob.id}/approve`, {}, alice);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/social/feed/following', undefined, bob)).json()
        .items,
    ).toHaveLength(1);
    await call('DELETE', `/social/followers/${bob.id}`, undefined, alice);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(404);
  });
  it('18A supports rejection, cancellation, private profile discovery without biography', async () => {
    await pool.query(
      "UPDATE privacy_settings SET profile_visibility='private' WHERE user_id=$1",
      [alice.id],
    );
    expect(
      (await call('GET', '/social/users/social_alice')).json().profile
        .accessible,
    ).toBe(false);
    await call('POST', `/social/users/${alice.id}/follow`, {}, bob);
    await call('DELETE', `/social/requests/${bob.id}`, undefined, alice);
    expect(
      (await call('GET', '/social/requests', undefined, alice)).json().items,
    ).toEqual([]);
    await call('POST', `/social/users/${alice.id}/follow`, {}, bob);
    await call('DELETE', `/social/users/${alice.id}/follow`, undefined, bob);
    expect(
      (await call('GET', '/social/requests', undefined, alice)).json().items,
    ).toEqual([]);
    const search = await call(
      'GET',
      '/social/users/search?q=social_alice',
      undefined,
      bob,
    );
    expect(search.json().items[0]).toMatchObject({
      id: alice.id,
      accessible: false,
    });
    expect(search.body).not.toMatch(/email|biography/);
  });
  it.each(['public', 'followers', 'private'])(
    '18B creates and edits %s posts without affecting source data',
    async (visibility) => {
      const p = await post(alice, { visibility });
      expect(p.visibility).toBe(visibility);
      expect(
        (
          await call(
            'PATCH',
            `/social/posts/${p.id}`,
            { text: 'Legenda editada', visibility: 'private', mediaIds: [] },
            alice,
          )
        ).json().post.text,
      ).toBe('Legenda editada');
      expect(
        (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
      ).toBe(404);
      expect(
        (
          await call(
            'GET',
            '/social/users/social_alice/posts',
            undefined,
            alice,
          )
        ).json().items,
      ).toHaveLength(1);
    },
  );
  it.each([
    { text: '' },
    { text: ' '.repeat(10) },
    { text: 'x'.repeat(2001) },
    { visibility: 'invalid' },
    { author_id: randomUUID() },
    {
      mediaIds: [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ],
    },
  ])('18B rejects invalid post %j', async (body) => {
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'ok', visibility: 'public', ...body },
          alice,
        )
      ).statusCode,
    ).toBe(400);
  });
  it('18B author alone edits/deletes; deleted posts cannot be liked or read', async () => {
    const p = await post();
    for (const method of ['PATCH', 'DELETE'] as const)
      expect(
        (
          await call(
            method,
            `/social/posts/${p.id}`,
            method === 'PATCH'
              ? { text: 'hack', visibility: 'public' }
              : undefined,
            bob,
          )
        ).statusCode,
      ).toBe(404);
    await call('DELETE', `/social/posts/${p.id}`, undefined, alice);
    for (const method of ['GET', 'POST'] as const)
      expect(
        (
          await call(
            method,
            `/social/posts/${p.id}${method === 'POST' ? '/like' : ''}`,
            undefined,
            bob,
          )
        ).statusCode,
      ).toBe(404);
  });
  it('18B associates only own motorcycles and handles archived garage without deleting post', async () => {
    const own = await bike(),
      other = await bike(bob);
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'Moto', visibility: 'public', motorcycleId: other },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    const p = await post(alice, { motorcycleId: own });
    expect(p.motorcycle.model).toBe('CB 650R');
    expect(p.motorcycle.photo_ref).toBeUndefined();
    await call('DELETE', `/motorcycles/${own}`, undefined, alice);
    expect(
      (await call('GET', `/social/posts/${p.id}`)).json().post.motorcycle,
    ).toBeNull();
  });
  it('18B shares server summary only explicitly, revokes on privacy/deletion, preserves ride on post deletion', async () => {
    const key = await ride();
    expect((await call('GET', '/social/feed')).json().items).toEqual([]);
    const p = await post(alice, { rideId: key });
    expect(p.ride).toMatchObject({
      id: key,
      locationPolicy: 'summary-only-v1',
    });
    expect(JSON.stringify(p)).not.toMatch(
      /longitude|latitude|points|maximum_kmh|speed|inclination|description/,
    );
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'x', visibility: 'public', rideId: key },
          bob,
        )
      ).statusCode,
    ).toBe(400);
    await pool.query("UPDATE rides SET visibility='private' WHERE id=$1", [
      key,
    ]);
    expect(
      (await call('GET', `/social/posts/${p.id}`)).json().post.ride,
    ).toBeNull();
    expect((await call('GET', `/public/rides/${key}`)).statusCode).toBe(404);
    await pool.query(
      "UPDATE rides SET visibility='public',deleted_at=now() WHERE id=$1",
      [key],
    );
    expect(
      (await call('GET', `/social/posts/${p.id}`)).json().post.ride,
    ).toBeNull();
    await call('DELETE', `/social/posts/${p.id}`, undefined, alice);
    expect(
      (await pool.query('SELECT id FROM rides WHERE id=$1', [key])).rowCount,
    ).toBe(1);
  });
  it('18B rejects private rides and local video/blob payloads', async () => {
    const key = await ride(alice, 'private');
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'x', visibility: 'public', rideId: key },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'x', visibility: 'public', videoUrl: 'blob:local' },
          alice,
        )
      ).statusCode,
    ).toBe(400);
  });
  it('18C concurrent likes are unique and counters remain exact after repeated unlike', async () => {
    const p = await post();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        call('POST', `/social/posts/${p.id}/like`, {}, bob),
      ),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).json().post,
    ).toMatchObject({ likes: 1, liked: true });
    await Promise.all(
      Array.from({ length: 8 }, () =>
        call('DELETE', `/social/posts/${p.id}/like`, undefined, bob),
      ),
    );
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).json().post,
    ).toMatchObject({ likes: 0, liked: false });
  });
  it.each(['', ' '.repeat(5), 'x'.repeat(1001)])(
    '18C rejects invalid comments of length %i',
    async (text) => {
      const p = await post();
      expect(
        (await call('POST', `/social/posts/${p.id}/comments`, { text }, bob))
          .statusCode,
      ).toBe(400);
    },
  );
  it('18C comments are plain text, paginated, author-only delete and real counts', async () => {
    const p = await post();
    for (const text of ['<script>alert(1)</script>', 'Segundo', 'Terceiro'])
      expect(
        (await call('POST', `/social/posts/${p.id}/comments`, { text }, bob))
          .statusCode,
      ).toBe(201);
    const first = (
      await call(
        'GET',
        `/social/posts/${p.id}/comments?limit=2`,
        undefined,
        alice,
      )
    ).json();
    expect(first.items).toHaveLength(2);
    const second = (
      await call(
        'GET',
        `/social/posts/${p.id}/comments?limit=2&cursor=${first.nextCursor}`,
        undefined,
        alice,
      )
    ).json();
    expect(second.items).toHaveLength(1);
    expect(
      new Set([...first.items, ...second.items].map((c) => c.id)).size,
    ).toBe(3);
    const key = second.items[0].id;
    expect(
      (await call('DELETE', `/social/comments/${key}`, undefined, charlie))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('DELETE', `/social/comments/${key}`, undefined, bob))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', `/social/posts/${p.id}`)).json().post.comments,
    ).toBe(2);
  });
  it('18C cursor handles equal timestamps, insertions and deletions without duplicates', async () => {
    const posts = await Promise.all(Array.from({ length: 5 }, () => post()));
    await pool.query(
      "UPDATE social_posts SET created_at='2026-10-23T10:00:00Z'",
    );
    const first = (await call('GET', '/social/feed?limit=2')).json();
    expect(first.items).toHaveLength(2);
    await post();
    await call(
      'DELETE',
      `/social/posts/${first.items[0].id}`,
      undefined,
      alice,
    );
    const second = (
      await call('GET', `/social/feed?limit=2&cursor=${first.nextCursor}`)
    ).json();
    const third = (
      await call('GET', `/social/feed?limit=2&cursor=${second.nextCursor}`)
    ).json();
    expect(
      new Set(
        [...first.items, ...second.items, ...third.items].map((p) => p.id),
      ).size,
    ).toBe(posts.length);
    expect(third.nextCursor).toBeNull();
  });
  it.each(['limit=0', 'limit=51', 'cursor=invalid'])(
    '18C validates pagination %s',
    async (q) => {
      expect((await call('GET', '/social/feed?' + q)).statusCode).toBe(400);
    },
  );
  it('18D block removes both follows, hides posts/comments/media/links and prevents interactions', async () => {
    const key = await ride(),
      m = await photo(),
      p = await post(alice, { rideId: key, mediaIds: [m.id] });
    const c = await call(
      'POST',
      `/social/posts/${p.id}/comments`,
      { text: 'Comentário anterior' },
      bob,
    );
    expect(c.statusCode).toBe(201);
    await call('POST', `/social/users/${alice.id}/follow`, {}, bob);
    await call('POST', `/social/users/${bob.id}/follow`, {}, alice);
    await call('POST', `/social/blocks/${bob.id}`, {}, alice);
    expect((await pool.query('SELECT * FROM social_follows')).rowCount).toBe(0);
    for (const path of [
      `/social/posts/${p.id}`,
      `/social/media/${m.id}`,
      `/public/rides/${key}`,
      '/social/users/social_alice',
      '/users/social_alice',
      '/users/social_alice/motorcycles',
    ])
      expect((await call('GET', path, undefined, bob)).statusCode, path).toBe(
        404,
      );
    for (const path of [
      `/social/posts/${p.id}/like`,
      `/social/posts/${p.id}/comments`,
      `/social/users/${alice.id}/follow`,
    ])
      expect(
        (await call('POST', path, { text: 'blocked' }, bob)).statusCode,
      ).toBe(404);
    expect(
      (
        await call('GET', `/social/posts/${p.id}/comments`, undefined, alice)
      ).json().items,
    ).toEqual([]);
    expect(
      (await call('GET', '/social/feed', undefined, bob)).json().items,
    ).toEqual([]);
    expect(
      (
        await call('GET', '/social/users/search?q=social_alice', undefined, bob)
      ).json().items,
    ).toEqual([]);
    await call('DELETE', `/social/blocks/${bob.id}`, undefined, alice);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(200);
    expect((await pool.query('SELECT * FROM social_follows')).rowCount).toBe(0);
  });
  it('18D block/like race cannot leave an authorized interaction after block', async () => {
    const p = await post();
    const responses = await Promise.all([
      call('POST', `/social/posts/${p.id}/like`, {}, bob),
      call('POST', `/social/blocks/${bob.id}`, {}, alice),
    ]);
    expect(responses[1]!.statusCode).toBe(200);
    expect(
      (await call('POST', `/social/posts/${p.id}/like`, {}, bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, alice)).json().post
        .likes,
    ).toBe(0);
  });
  it.each(['private', 'followers'])(
    '18D %s post denies anonymous reads, photos and interactions',
    async (visibility) => {
      const m = await photo(),
        p = await post(alice, { visibility, mediaIds: [m.id] });
      for (const path of [
        `/social/posts/${p.id}`,
        `/social/posts/${p.id}/comments`,
        `/social/media/${m.id}`,
      ])
        expect((await call('GET', path)).statusCode).toBe(404);
      expect(
        (await call('POST', `/social/posts/${p.id}/like`, {}, bob)).statusCode,
      ).toBe(404);
      await call('POST', `/social/users/${alice.id}/follow`, {}, bob);
      expect(
        (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
      ).toBe(visibility === 'followers' ? 200 : 404);
      expect((await call('GET', '/social/feed')).json().items).toEqual([]);
    },
  );
  it('18D privacy changes invalidate direct media links and feed; no-store on all reads', async () => {
    const m = await photo(),
      p = await post(alice, { mediaIds: [m.id] });
    expect((await call('GET', `/social/media/${m.id}`)).statusCode).toBe(200);
    await call(
      'PATCH',
      `/social/posts/${p.id}`,
      { text: p.text, visibility: 'private', mediaIds: [m.id] },
      alice,
    );
    expect((await call('GET', `/social/media/${m.id}`)).statusCode).toBe(404);
    expect(
      (await call('GET', `/social/media/${m.id}`, undefined, alice)).headers[
        'cache-control'
      ],
    ).toBe('private, no-store');
    expect((await call('GET', '/social/feed')).json().items).toEqual([]);
  });
  it.each(['post', 'comment', 'profile'] as const)(
    '18D reports %s once without deleting content or exposing reporter',
    async (kind) => {
      const p = await post(),
        c = await call(
          'POST',
          `/social/posts/${p.id}/comments`,
          { text: 'Comentário' },
          alice,
        );
      const key =
        kind === 'post' ? p.id : kind === 'comment' ? c.json().id : alice.id;
      const result = await call(
        'POST',
        '/social/reports',
        { kind, id: key, reason: 'personal_data' },
        bob,
      );
      expect(result.statusCode).toBe(201);
      expect(
        (
          await call(
            'POST',
            '/social/reports',
            { kind, id: key, reason: 'spam' },
            bob,
          )
        ).statusCode,
      ).toBe(409);
      expect((await call('GET', `/social/posts/${p.id}`)).statusCode).toBe(200);
      expect(result.body).not.toContain(bob.id);
    },
  );
  it('18D authenticated writes require CSRF, anonymous writes fail and abuse is limited', async () => {
    expect(
      (await call('POST', '/social/posts', { text: 'x', visibility: 'public' }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'x', visibility: 'public' },
          alice,
          { 'x-csrf-token': 'invalid' },
        )
      ).statusCode,
    ).toBe(403);
    for (let i = 0; i < 10; i++) await post();
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'x', visibility: 'public' },
          alice,
        )
      ).statusCode,
    ).toBe(429);
  });
  it.each(['jpeg', 'png', 'webp'] as const)(
    '18D real %s is reencoded with thumbnail and without EXIF',
    async (format) => {
      const m = await photo(alice, format);
      const full = await call('GET', `/social/media/${m.id}`, undefined, alice),
        thumb = await call(
          'GET',
          `/social/media/${m.id}?size=thumb`,
          undefined,
          alice,
        );
      expect(full.statusCode).toBe(200);
      const meta = await sharp(full.rawPayload).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect((await sharp(thumb.rawPayload).metadata()).width).toBe(480);
      expect(
        (await call('GET', `/social/media/${m.id}`, undefined, bob)).statusCode,
      ).toBe(404);
    },
  );
  it('18D supports five photos atomically; cannot steal or reuse media from other posts', async () => {
    const media = [];
    for (let n = 0; n < 5; n++) media.push(await photo());
    const p = await post(alice, { mediaIds: media.map((m) => m.id) });
    expect(p.media).toHaveLength(5);
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'Steal', visibility: 'public', mediaIds: [media[0].id] },
          bob,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'Reuse', visibility: 'public', mediaIds: [media[0].id] },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    const edited = await call(
      'PATCH',
      `/social/posts/${p.id}`,
      {
        text: p.text,
        visibility: 'public',
        mediaIds: media.map((m) => m.id).reverse(),
      },
      alice,
    );
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json().post.media[0].id).toBe(media[4].id);
  });
  it.each([
    Buffer.from('<svg><script>alert(1)</script></svg>'),
    Buffer.from('fake.jpg'),
    Buffer.from([0xff, 0xd8, 0xff]),
  ])('18D rejects invalid/faked/corrupt image %#', async (bytes) => {
    expect(
      (
        await call('POST', '/social/media', bytes, alice, {
          'content-type': 'image/jpeg',
        })
      ).statusCode,
    ).toBe(400);
  });
  it('18D rejects oversized files and pixel bombs', async () => {
    expect(
      (
        await call(
          'POST',
          '/social/media',
          Buffer.alloc(5 * 1024 * 1024 + 1),
          alice,
          { 'content-type': 'image/png' },
        )
      ).statusCode,
    ).toBe(413);
    const bytes = await sharp({
      create: { width: 6400, height: 6400, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    expect(
      (
        await call('POST', '/social/media', bytes, alice, {
          'content-type': 'image/png',
        })
      ).statusCode,
    ).toBe(400);
  });
  it('18D cleans abandoned/deleted uploads, retries storage failures and preserves confirmed media', async () => {
    const abandoned = await photo(),
      kept = await photo();
    const p = await post(alice, { mediaIds: [kept.id] });
    await pool.query(
      "UPDATE social_post_media SET created_at=now()-interval '2 hours' WHERE id=$1",
      [abandoned.id],
    );
    await pool.query('UPDATE social_media_cleanup SET available_at=now()');
    failRemove = true;
    await cleanupSocialMedia(pool, storage);
    expect(
      (await pool.query('SELECT * FROM social_media_cleanup WHERE attempts>0'))
        .rowCount,
    ).toBeGreaterThan(0);
    failRemove = false;
    await pool.query('UPDATE social_media_cleanup SET available_at=now()');
    await cleanupSocialMedia(pool, storage);
    expect(files.size).toBe(2);
    expect((await call('GET', `/social/media/${kept.id}`)).statusCode).toBe(
      200,
    );
    failGet = true;
    expect((await call('GET', `/social/media/${kept.id}`)).statusCode).toBe(
      503,
    );
    failGet = false;
    await call('DELETE', `/social/posts/${p.id}`, undefined, alice);
    await cleanupSocialMedia(pool, storage);
    expect(files.size).toBe(0);
    failPut = true;
    expect(
      (
        await call(
          'POST',
          '/social/media',
          await sharp({
            create: { width: 2, height: 2, channels: 3, background: '#fff' },
          })
            .png()
            .toBuffer(),
          alice,
          { 'content-type': 'image/png' },
        )
      ).statusCode,
    ).toBe(503);
    expect((await call('GET', '/social/feed')).json().items).toEqual([]);
  });
  it('18D partial attachment failure creates no post and retains valid pending photo', async () => {
    const m = await photo();
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'x', visibility: 'public', mediaIds: [m.id, randomUUID()] },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    expect((await pool.query('SELECT * FROM social_posts')).rowCount).toBe(0);
    expect(
      (await call('GET', `/social/media/${m.id}`, undefined, alice)).statusCode,
    ).toBe(200);
  });
  it('18E feed query is bounded and uses chronological index with 2000 posts', async () => {
    await pool.query(
      "INSERT INTO social_posts(id,author_id,text,visibility,created_at) SELECT gen_random_uuid(),$1,'Carga sintética isolada','public',now()-(n||' seconds')::interval FROM generate_series(1,2000)n",
      [alice.id],
    );
    await pool.query('ANALYZE social_posts');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL enable_seqscan=off');
      const result = await c.query(
        `EXPLAIN (ANALYZE,FORMAT JSON) ${postSelect} WHERE s.group_id IS NULL AND ${postAccess} AND s.visibility='public' AND ps.profile_visibility='public' ORDER BY s.created_at DESC,s.id DESC LIMIT 21`,
        [bob.id],
      );
      const plan = JSON.stringify(result.rows);
      expect(plan).toMatch(
        /social_posts_feed|social_posts_public|social_group_feed/,
      );
      expect(result.rows[0]['QUERY PLAN'][0]['Execution Time']).toBeLessThan(
        2000,
      );
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
    const page = (
      await call('GET', '/social/feed?limit=20', undefined, bob)
    ).json();
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBeTruthy();
  });
  it('18E search preserves original microseconds and opaque cursor rejects non-ISO timestamps', async () => {
    await pool.query(
      "UPDATE users SET created_at='2026-10-23T12:00:00.123456Z' WHERE id=ANY($1::uuid[])",
      [[alice.id, bob.id, charlie.id]],
    );
    const first = (
      await call(
        'GET',
        '/social/users/search?q=social&limit=1',
        undefined,
        alice,
      )
    ).json();
    const second = (
      await call(
        'GET',
        `/social/users/search?q=social&limit=1&cursor=${first.nextCursor}`,
        undefined,
        alice,
      )
    ).json();
    expect(second.items[0].id).not.toBe(first.items[0].id);
    const cursor = Buffer.from(
      JSON.stringify({ at: '10', id: alice.id }),
    ).toString('base64url');
    expect(
      (await call('GET', '/social/feed?cursor=' + cursor)).statusCode,
    ).toBe(400);
  });
});
