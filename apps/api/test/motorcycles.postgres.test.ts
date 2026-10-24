import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  unlink,
  rmdir,
  readFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import {
  cleanupPhotos,
  LocalPhotoStorage,
} from '../src/modules/motorcycles/photos.js';

const url = process.env.TEST_DATABASE_URL;
const schema = `garage_test_${randomUUID().replaceAll('-', '')}`;
const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: url ?? 'postgresql://test:example@127.0.0.1:55432/apex_ride',
  DATABASE_SSL: process.env.DATABASE_SSL ?? 'disable',
});
const valid = {
  brand: 'Honda',
  model: 'CB 650R',
  year: 2024,
  displacementCc: 649,
};
interface Session {
  cookie: string;
  csrf: string;
  id: string;
}
let admin: pg.Pool,
  pool: pg.Pool,
  app: FastifyInstance,
  directory: string,
  storage: LocalPhotoStorage;
let alice: Session, bob: Session;
let failPut = false,
  failRemove = false,
  failGet = false;
let image: Buffer;
function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  session?: Session,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method,
    url: `/api${path}`,
    headers: {
      origin: 'http://127.0.0.1:5173',
      'x-apex-request': '1',
      ...(session
        ? { cookie: session.cookie, 'x-csrf-token': session.csrf }
        : {}),
      ...headers,
    },
    ...(payload === undefined
      ? {}
      : { payload: payload as Buffer | Record<string, unknown> }),
  });
}
async function account(name: string): Promise<Session> {
  const data = {
    displayName: name,
    username: name,
    email: `${name}@example.com`,
    password: 'frase de senha longa e segura',
    acceptTerms: true,
    termsVersion: 'prelaunch-draft',
    privacyVersion: 'prelaunch-draft',
  };
  expect((await call('POST', '/auth/register', data)).statusCode).toBe(201);
  const login = await call('POST', '/auth/login', {
    email: data.email,
    password: data.password,
  });
  expect(login.statusCode).toBe(200);
  return {
    cookie: String(login.headers['set-cookie']).split(';')[0]!,
    csrf: login.json().csrfToken,
    id: login.json().user.id,
  };
}
async function create(session = alice, data = valid) {
  const result = await call('POST', '/motorcycles', data, session);
  expect(result.statusCode, result.body).toBe(201);
  return result.json().motorcycle as {
    id: string;
    isPrimary: boolean;
    photoUrl: string | null;
  };
}
async function upload(
  id: string,
  bytes = image,
  session = alice,
  type = 'image/jpeg',
) {
  return call('POST', `/motorcycles/${id}/photo`, bytes, session, {
    'content-type': type,
  });
}
async function photoRef(id: string) {
  return (
    await pool.query('SELECT photo_ref FROM motorcycles WHERE id=$1', [id])
  ).rows[0].photo_ref as string;
}

describe.skipIf(!url)('Garagem com PostgreSQL e arquivos reais', () => {
  beforeAll(async () => {
    const options = {
      connectionString: config.databaseUrl,
      ssl:
        config.databaseSsl === 'verify-full'
          ? { rejectUnauthorized: true }
          : false,
    };
    admin = new pg.Pool(options);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ ...options, options: `-c search_path=${schema}` });
    await migrate(pool);
    await mkdir(dirname(config.motorcycleStorageDir), { recursive: true });
    directory = await mkdtemp(`${config.motorcycleStorageDir}-test-`);
    storage = new LocalPhotoStorage(directory);
    app = await buildApp({
      config,
      logger: false,
      database: { pool, check: async () => {}, close: async () => {} },
      motorcycleStorage: {
        put: async (key, bytes) => {
          if (failPut) throw new Error('disk internal secret');
          await storage.put(key, bytes);
        },
        get: async (key) => {
          if (failGet) throw new Error('disk internal secret');
          return storage.get(key);
        },
        remove: async (key) => {
          if (failRemove) throw new Error('disk internal secret');
          await storage.remove(key);
        },
      },
    });
    await app.ready();
    alice = await account('alice_piloto');
    bob = await account('bob_piloto');
    image = await sharp({
      create: { width: 2300, height: 1000, channels: 3, background: '#e52435' },
    })
      .jpeg()
      .withExif({
        IFD0: { Artist: 'private-author', Orientation: '6' },
        IFD3: {
          GPSLatitudeRef: 'S',
          GPSLatitude: '9/1 40/1 0/1',
          GPSLongitudeRef: 'W',
          GPSLongitude: '35/1 44/1 0/1',
        },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
  }, 20000);
  beforeEach(async () => {
    failPut = false;
    failRemove = false;
    failGet = false;
    await pool.query(
      'TRUNCATE social_reports,social_post_comments,social_post_likes,social_post_media,social_posts,ride_similarity_matches,ride_similarity_index,ride_laps,ride_performance_events,ride_motion_samples,ride_motion,ride_points,rides,motorcycles,motorcycle_photo_cleanup,xp_ledger,user_progress,user_achievements,personal_challenges,gamification_jobs,leaderboard_scores,gamification_projection_cursor,gamification_audit CASCADE',
    );
    await pool.query("UPDATE privacy_settings SET profile_visibility='public'");
    await pool.query(
      "UPDATE user_sessions SET expires_at=now()+interval '1 hour',revoked_at=NULL",
    );
    for (const name of await readdir(directory))
      await unlink(join(directory, name));
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (directory) {
      for (const name of await readdir(directory))
        await unlink(join(directory, name));
      await rmdir(directory);
    }
    if (admin) {
      if (!/^garage_test_[a-f0-9]{32}$/.test(schema))
        throw new Error('Esquema inválido');
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it('começa vazia, persiste cadastro e mantém dados após reexecutar migrações', async () => {
    expect(
      (await call('GET', '/motorcycles', undefined, alice)).json().motorcycles,
    ).toEqual([]);
    expect(
      (await call('GET', '/motorcycles/primary', undefined, alice)).json()
        .motorcycle,
    ).toBeNull();
    const bike = await create();
    expect(bike.isPrimary).toBe(true);
    await migrate(pool);
    const saved = (
      await pool.query('SELECT * FROM motorcycles WHERE id=$1', [bike.id])
    ).rows[0];
    expect(saved).toMatchObject({
      owner_id: alice.id,
      displacement_cc: 649,
      brand: 'Honda',
      is_primary: true,
    });
    const detail = await call(
      'GET',
      `/motorcycles/${bike.id}`,
      undefined,
      alice,
    );
    expect(detail.json().motorcycle).toMatchObject({
      ...valid,
      photoUrl: null,
    });
    expect(detail.body).not.toMatch(/owner_id|photo_ref|password|secret_hash/);
    expect(
      (await call('GET', '/motorcycles/primary', undefined, alice)).json()
        .motorcycle.id,
    ).toBe(bike.id);
  });
  it.each([
    { brand: '' },
    { brand: undefined },
    { brand: '  ' },
    { brand: 'x'.repeat(61) },
    { brand: null },
    { model: '' },
    { model: undefined },
    { model: 'x'.repeat(101) },
    { model: 'a\nb' },
    { year: 1884 },
    { year: undefined },
    { year: new Date().getFullYear() + 2 },
    { year: 2024.5 },
    { year: '2024' },
    { displacementCc: 0 },
    { displacementCc: undefined },
    { displacementCc: -1 },
    { displacementCc: 10001 },
    { displacementCc: 1.5 },
    { ownerId: randomUUID() },
    { isPrimary: true },
  ])('valida cadastro e edição: %j', async (invalid) => {
    expect(
      (await call('POST', '/motorcycles', { ...valid, ...invalid }, alice))
        .statusCode,
    ).toBe(400);
    const bike = await create();
    expect(
      (await call('PATCH', `/motorcycles/${bike.id}`, invalid, alice))
        .statusCode,
    ).toBe(400);
    expect(
      (await pool.query('SELECT model FROM motorcycles')).rows[0].model,
    ).toBe(valid.model);
  });
  it('aceita limites e fabricantes manuais; PATCH preserva os outros campos', async () => {
    const bike = await create(alice, {
      brand: 'Outra fabricante',
      model: 'Protótipo',
      year: new Date().getFullYear() + 1,
      displacementCc: 10000,
    });
    expect(
      (
        await call(
          'PATCH',
          `/motorcycles/${bike.id}`,
          { brand: ' Yamaha ', displacementCc: 1 },
          alice,
        )
      ).json().motorcycle,
    ).toMatchObject({ brand: 'Yamaha', model: 'Protótipo', displacementCc: 1 });
    expect(
      (await pool.query('SELECT count(*) FROM motorcycles')).rows[0].count,
    ).toBe('1');
    expect(
      (await call('PATCH', `/motorcycles/${bike.id}`, {}, alice)).statusCode,
    ).toBe(400);
  });
  it('isola listagem, detalhes e todas as alterações por propriedade', async () => {
    const bike = await create();
    expect(
      (await call('GET', '/motorcycles', undefined, bob)).json().motorcycles,
    ).toEqual([]);
    for (const [method, suffix, body] of [
      ['GET', '', undefined],
      ['PATCH', '', { model: 'roubada' }],
      ['DELETE', '', undefined],
      ['PATCH', '/primary', undefined],
      ['DELETE', '/photo', undefined],
    ] as const) {
      expect(
        (await call(method, `/motorcycles/${bike.id}${suffix}`, body, bob))
          .statusCode,
      ).toBe(404);
    }
    expect((await upload(bike.id, image, bob)).statusCode).toBe(404);
    expect(
      (await call('GET', '/motorcycles/not-a-uuid', undefined, alice))
        .statusCode,
    ).toBe(404);
  });
  it('exige sessão, CSRF e origem confiável; sessão expirada não autoriza', async () => {
    const bike = await create();
    for (const [method, suffix, body] of [
      ['GET', '', undefined],
      ['PATCH', '', valid],
      ['DELETE', '', undefined],
      ['PATCH', '/primary', undefined],
      ['DELETE', '/photo', undefined],
    ] as const) {
      expect(
        (await call(method, `/motorcycles/${bike.id}${suffix}`, body))
          .statusCode,
      ).toBe(401);
      if (method !== 'GET')
        expect(
          (
            await call(
              method,
              `/motorcycles/${bike.id}${suffix}`,
              body,
              alice,
              { 'x-csrf-token': '' },
            )
          ).statusCode,
        ).toBe(403);
    }
    expect((await call('GET', '/motorcycles')).statusCode).toBe(401);
    expect((await call('POST', '/motorcycles', valid)).statusCode).toBe(401);
    expect(
      (
        await call('POST', `/motorcycles/${bike.id}/photo`, image, undefined, {
          'content-type': 'image/jpeg',
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await call('POST', '/motorcycles', valid, alice, {
          origin: 'https://external.invalid',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call('POST', '/motorcycles', valid, alice, {
          'x-apex-request': '',
        })
      ).statusCode,
    ).toBe(403);
    await pool.query(
      "UPDATE user_sessions SET expires_at=now()-interval '1 second'",
    );
    expect(
      (await call('GET', '/motorcycles', undefined, alice)).statusCode,
    ).toBe(401);
    expect(
      (await call('DELETE', `/motorcycles/${bike.id}`, undefined, alice))
        .statusCode,
    ).toBe(401);
  });
  it('serializa cadastros e trocas de principal concorrentes; índice impede duas principais', async () => {
    const bikes = await Promise.all(Array.from({ length: 6 }, () => create()));
    expect(bikes.filter((bike) => bike.isPrimary)).toHaveLength(1);
    const changes = await Promise.all(
      bikes.map((bike) =>
        call('PATCH', `/motorcycles/${bike.id}/primary`, undefined, alice),
      ),
    );
    expect(changes.every((r) => r.statusCode === 200)).toBe(true);
    expect(
      (await pool.query('SELECT count(*) FROM motorcycles WHERE is_primary'))
        .rows[0].count,
    ).toBe('1');
    await expect(
      pool.query('UPDATE motorcycles SET is_primary=true'),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('arquiva principal, promove outra e chega ao estado vazio sem excluir usuário', async () => {
    const first = await create(),
      next = await create();
    expect(
      (await call('DELETE', `/motorcycles/${first.id}`, undefined, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/motorcycles/primary', undefined, alice)).json()
        .motorcycle.id,
    ).toBe(next.id);
    expect(
      (await call('GET', `/motorcycles/${first.id}`, undefined, alice))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await pool.query(
          'SELECT archived_at,is_primary FROM motorcycles WHERE id=$1',
          [first.id],
        )
      ).rows[0],
    ).toMatchObject({ archived_at: expect.any(Date), is_primary: false });
    await call('DELETE', `/motorcycles/${next.id}`, undefined, alice);
    expect(
      (await call('GET', '/motorcycles', undefined, alice)).json().motorcycles,
    ).toEqual([]);
    expect((await create()).isPrimary).toBe(true);
    expect((await call('GET', '/auth/me', undefined, alice)).statusCode).toBe(
      200,
    );
  });
  it.each(['jpeg', 'png', 'webp'] as const)(
    'decodifica %s real sem confiar no MIME e salva WebP',
    async (format) => {
      const bike = await create();
      const bytes = await sharp(image)[format]().toBuffer();
      const result = await upload(
        bike.id,
        bytes,
        alice,
        'application/octet-stream',
      );
      expect(result.statusCode, result.body).toBe(200);
      const key = await photoRef(bike.id);
      expect(key).toMatch(/^[a-f0-9-]{36}\.webp$/);
      const stored = await readFile(join(directory, key));
      expect((await sharp(stored).metadata()).format).toBe('webp');
      expect(result.body).not.toContain(key);
    },
  );
  it('remove EXIF/GPS e demais metadados, corrige orientação e reduz dimensão', async () => {
    const input = await sharp(image).metadata();
    expect(input.exif).toBeDefined();
    expect(input.orientation).toBe(6);
    const bike = await create();
    expect((await upload(bike.id)).statusCode).toBe(200);
    const response = await call(
      'GET',
      `/motorcycles/${bike.id}/photo`,
      undefined,
      alice,
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    const output = await sharp(response.rawPayload).metadata();
    expect(output.width).toBeLessThanOrEqual(1600);
    expect(output.height).toBe(1600);
    expect(output.exif).toBeUndefined();
    expect(output.xmp).toBeUndefined();
    expect(output.icc).toBeUndefined();
    expect(output.orientation).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
  it.each([
    Buffer.from('MZ executable'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    Buffer.from([0xff, 0xd8, 0xff, 0]),
    Buffer.from('not an image'),
  ])(
    'rejeita conteúdo falso ou corrompido mesmo declarado JPEG: %j',
    async (bytes) => {
      const bike = await create();
      expect((await upload(bike.id, bytes)).statusCode).toBe(400);
      expect(await readdir(directory)).toEqual([]);
    },
  );
  it('rejeita mais de 5 MB, SVG e HEIC sem conversão', async () => {
    const bike = await create();
    expect(
      (await upload(bike.id, Buffer.alloc(5 * 1024 * 1024 + 1))).statusCode,
    ).toBe(413);
    expect(
      (await upload(bike.id, Buffer.from('heic'), alice, 'image/heic'))
        .statusCode,
    ).toBe(400);
    expect(
      (await upload(bike.id, Buffer.from('<svg/>'), alice, 'image/svg+xml'))
        .statusCode,
    ).toBe(400);
  });
  it('substitui e remove fotos; exclui arquivo da moto arquivada', async () => {
    const bike = await create();
    await upload(bike.id);
    const old = await photoRef(bike.id);
    await upload(bike.id);
    const current = await photoRef(bike.id);
    expect(current).not.toBe(old);
    expect(await readdir(directory)).toEqual([current]);
    expect(
      (
        await call('DELETE', `/motorcycles/${bike.id}/photo`, undefined, alice)
      ).json().motorcycle.photoUrl,
    ).toBeNull();
    expect(await readdir(directory)).toEqual([]);
    expect(
      (await call('GET', `/motorcycles/${bike.id}/photo`, undefined, alice))
        .statusCode,
    ).toBe(404);
    await upload(bike.id);
    await call('DELETE', `/motorcycles/${bike.id}`, undefined, alice);
    expect(await readdir(directory)).toEqual([]);
  });
  it('garagem e imagens acompanham privacidade imediatamente, inclusive usando URL anterior', async () => {
    const bike = await create();
    await upload(bike.id);
    const path = `/motorcycles/${bike.id}/photo`;
    const publicList = await call('GET', '/users/alice_piloto/motorcycles');
    expect(publicList.statusCode).toBe(200);
    expect(publicList.body).not.toMatch(/owner_id|photo_ref|email|secret/);
    expect((await call('GET', path)).statusCode).toBe(200);
    expect(
      (
        await call(
          'PATCH',
          '/users/me/privacy',
          { profileVisibility: 'private' },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/users/alice_piloto/motorcycles')).statusCode,
    ).toBe(404);
    expect((await call('GET', path)).statusCode).toBe(404);
    expect((await call('GET', path, undefined, bob)).statusCode).toBe(404);
    expect((await call('GET', path, undefined, alice)).statusCode).toBe(200);
    expect(
      (await call('GET', '/motorcycles', undefined, alice)).json().motorcycles,
    ).toHaveLength(1);
    await call(
      'PATCH',
      '/users/me/privacy',
      { profileVisibility: 'public' },
      alice,
    );
    expect((await call('GET', path)).statusCode).toBe(200);
  });
  it('falha na substituição preserva foto anterior e não expõe erros internos', async () => {
    const bike = await create();
    await upload(bike.id);
    const previous = await photoRef(bike.id);
    failPut = true;
    const result = await upload(bike.id);
    expect(result.statusCode).toBe(503);
    expect(result.body).not.toMatch(/disk|secret/);
    expect(await photoRef(bike.id)).toBe(previous);
    expect(await readdir(directory)).toEqual([previous]);
    failGet = true;
    expect(
      (await call('GET', `/motorcycles/${bike.id}/photo`, undefined, alice))
        .statusCode,
    ).toBe(503);
  });
  it('fila durável retenta exclusão física que falhou e recupera upload interrompido', async () => {
    const bike = await create();
    await upload(bike.id);
    const old = await photoRef(bike.id);
    failRemove = true;
    expect(
      (await call('DELETE', `/motorcycles/${bike.id}/photo`, undefined, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          'SELECT attempts FROM motorcycle_photo_cleanup WHERE photo_ref=$1',
          [old],
        )
      ).rows[0].attempts,
    ).toBeGreaterThan(0);
    const orphan = `${randomUUID()}.webp`;
    await storage.put(orphan, image);
    await pool.query(
      'INSERT INTO motorcycle_photo_cleanup(photo_ref) VALUES($1)',
      [orphan],
    );
    await pool.query('UPDATE motorcycle_photo_cleanup SET available_at=now()');
    await cleanupPhotos(pool, storage);
    expect(await readdir(directory)).toEqual([]);
    expect(
      (await pool.query('SELECT * FROM motorcycle_photo_cleanup')).rows,
    ).toEqual([]);
  });
  it('limpeza nunca apaga imagem referenciada mesmo com entrada indevida na fila', async () => {
    const bike = await create();
    await upload(bike.id);
    const key = await photoRef(bike.id);
    await pool.query(
      'INSERT INTO motorcycle_photo_cleanup(photo_ref) VALUES($1)',
      [key],
    );
    await cleanupPhotos(pool, storage);
    expect(await readdir(directory)).toEqual([key]);
  });
});
