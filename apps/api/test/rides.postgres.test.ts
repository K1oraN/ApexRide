import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import type { RidePayload } from '@apex-ride/ride-core';
import { motionFixture } from './motion-fixtures.js';
import { analyzeTelemetry } from '@apex-ride/ride-core/telemetry';
import { telemetryFixture } from './telemetry-fixtures.js';
const url = process.env.TEST_DATABASE_URL;
const schema = `rides_test_${randomUUID().replaceAll('-', '')}`;
const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: url ?? 'postgresql://test:test@127.0.0.1:55432/apex_ride',
  DATABASE_SSL: process.env.DATABASE_SSL ?? 'disable',
});
interface Session {
  cookie: string;
  csrf: string;
  id: string;
}
let admin: pg.Pool,
  pool: pg.Pool,
  app: FastifyInstance,
  alice: Session,
  bob: Session,
  bike: string;
function call(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
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
      : { payload: payload as Record<string, unknown> }),
  });
}
async function account(name: string) {
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
  return {
    cookie: String(login.headers['set-cookie']).split(';')[0]!,
    csrf: login.json().csrfToken,
    id: login.json().user.id,
  };
}
function activity(): RidePayload {
  const start = Date.now() - 60_000;
  return {
    clientId: randomUUID(),
    motorcycleId: bike,
    mode: 'passeio',
    visibility: 'public',
    startedAt: start,
    endedAt: start + 10_000,
    intervals: [{ start, end: start + 10_000 }],
    points: [0, 1, 2].map((n) => ({
      latitude: -9.665,
      longitude: -35.735 + n * 0.0001,
      timestamp: start + n * 1000,
      accuracy: 8,
      speed: 10,
      heading: 90,
      altitude: null,
      segment: 0,
    })),
  };
}
describe.skipIf(!url)('Sessões com PostgreSQL e PostGIS reais', () => {
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
    pool = new pg.Pool({
      ...options,
      options: `-c search_path=${schema},public`,
    });
    await migrate(pool);
    app = await buildApp({
      config,
      logger: false,
      database: { pool, check: async () => {}, close: async () => {} },
    });
    await app.ready();
    alice = await account('ride_alice');
    bob = await account('ride_bob');
    const result = await call(
      'POST',
      '/motorcycles',
      { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
      alice,
    );
    bike = result.json().motorcycle.id;
  }, 20_000);
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE social_reports,social_post_comments,social_post_likes,social_post_media,social_posts,ride_similarity_matches,ride_similarity_index,ride_laps,ride_upload_batches,ride_uploads,ride_performance_events,ride_motion_samples,ride_motion,ride_points,rides,xp_ledger,user_progress,user_achievements,personal_challenges,gamification_jobs,leaderboard_scores,gamification_projection_cursor,gamification_audit CASCADE',
    );
    await pool.query('UPDATE motorcycles SET archived_at=NULL WHERE id=$1', [
      bike,
    ]);
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (admin) {
      if (/^rides_test_[a-f0-9]{32}$/.test(schema))
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
  function uploadParts(b: RidePayload) {
    const series = [
      b.points,
      b.motion?.samples ?? [],
      b.speedProcessing?.samples ?? [],
      b.telemetry?.events ?? [],
    ];
    const meta = {
      ...b,
      points: [],
      ...(b.motion ? { motion: { ...b.motion, samples: [] } } : {}),
      ...(b.speedProcessing
        ? { speedProcessing: { ...b.speedProcessing, samples: [] } }
        : {}),
      ...(b.telemetry ? { telemetry: { ...b.telemetry, events: [] } } : {}),
    };
    const manifest = {
      version: 1,
      meta,
      counts: {
        points: series[0]!.length,
        motion: series[1]!.length,
        speed: series[2]!.length,
        events: series[3]!.length,
      },
    };
    return {
      manifest,
      batch: (index: number) => ({
        points: series[0]!.slice(index * 500, (index + 1) * 500),
        motion: series[1]!.slice(index * 500, (index + 1) * 500),
        speed: series[2]!.slice(index * 500, (index + 1) * 500),
        events: series[3]!.slice(index * 500, (index + 1) * 500),
      }),
    };
  }
  it('offline: lotes fora de ordem, duplicação concorrente, retomada, propriedade e confirmação idempotente', async () => {
    const b = activity();
    b.startedAt = Date.now() - 1100000;
    b.endedAt = b.startedAt + 1001000;
    b.intervals = [{ start: b.startedAt, end: b.endedAt }];
    b.points = Array.from({ length: 1001 }, (_, i) => ({
      ...b.points[0]!,
      timestamp: b.startedAt + i * 1000,
      longitude: -35.735 + i * 0.00001,
      speed: 1,
    }));
    const { manifest, batch } = uploadParts(b);
    const path = `/rides/sync/${b.clientId}`;
    expect((await call('POST', path, manifest, alice)).statusCode).toBe(200);
    expect(
      (await call('POST', `${path}/batches/1`, batch(1), bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `${path}/batches/2`, batch(2), alice)).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/rides', undefined, alice)).json().rides,
    ).toHaveLength(0);
    expect((await call('POST', `${path}/complete`, {}, alice)).statusCode).toBe(
      409,
    );
    expect((await call('POST', path, manifest, alice)).json().received).toEqual(
      [2],
    );
    const repeated = await Promise.all([
      call('POST', `${path}/batches/0`, batch(0), alice),
      call('POST', `${path}/batches/0`, batch(0), alice),
    ]);
    expect(repeated.map((r) => r.statusCode)).toEqual([200, 200]);
    const changed = batch(0);
    changed.points[0] = { ...changed.points[0]!, speed: 2 };
    expect(
      (await call('POST', `${path}/batches/0`, changed, alice)).statusCode,
    ).toBe(409);
    await call('POST', `${path}/batches/1`, batch(1), alice);
    const completed = await Promise.all([
      call('POST', `${path}/complete`, {}, alice),
      call('POST', `${path}/complete`, {}, alice),
    ]);
    expect(completed.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(completed[0]!.json().id).toBe(completed[1]!.json().id);
    expect((await call('POST', '/rides', b, alice)).json().id).toBe(
      completed[0]!.json().id,
    );
    expect(
      (await call('GET', '/rides', undefined, alice)).json().rides,
    ).toHaveLength(1);
    expect(
      (
        await call('GET', `/rides/${completed[0]!.json().id}`, undefined, alice)
      ).json().points,
    ).toHaveLength(1001);
  });
  it('offline: manifesta conflito, rejeita limites e valida dados completos antes de publicar', async () => {
    const b = activity();
    const { manifest, batch } = uploadParts(b);
    const path = `/rides/sync/${b.clientId}`;
    expect(
      (
        await call(
          'POST',
          path,
          { ...manifest, counts: { ...manifest.counts, points: 50001 } },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    expect((await call('POST', path, manifest)).statusCode).toBe(401);
    expect(
      (await call('POST', path, manifest, alice, { 'x-csrf-token': 'wrong' }))
        .statusCode,
    ).toBe(403);
    await call('POST', path, manifest, alice);
    expect(
      (
        await call(
          'POST',
          path,
          { ...manifest, meta: { ...manifest.meta, visibility: 'private' } },
          alice,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (await call('POST', `${path}/batches/1`, batch(0), alice)).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          `${path}/batches/0`,
          { ...batch(0), points: [] },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    const malformed = batch(0);
    malformed.points[0] = { ...malformed.points[0]!, latitude: 999 };
    await call('POST', `${path}/batches/0`, malformed, alice);
    expect((await call('POST', `${path}/complete`, {}, alice)).statusCode).toBe(
      400,
    );
    expect(
      (await call('GET', '/rides', undefined, alice)).json().rides,
    ).toHaveLength(0);
  });
  it('offline: consolida sensores, série assistida e eventos com o mesmo resultado do contrato existente', async () => {
    const b = telemetryFixture();
    b.motorcycleId = bike;
    b.telemetry = analyzeTelemetry(b);
    const { manifest, batch } = uploadParts(b);
    const path = `/rides/sync/${b.clientId}`;
    await call('POST', path, manifest, alice);
    await call('POST', `${path}/batches/0`, batch(0), alice);
    const done = await call('POST', `${path}/complete`, {}, alice);
    expect(done.statusCode).toBe(200);
    expect(
      (await call('GET', `/rides/${done.json().id}`, undefined, alice)).json()
        .telemetry,
    ).toEqual(b.telemetry);
  });
  it('offline: 50.000 pontos em cem lotes preservam todos os pontos sem truncamento', async () => {
    const b = activity();
    b.startedAt = Date.now() - 50001000;
    b.endedAt = b.startedAt + 50000000;
    b.intervals = [{ start: b.startedAt, end: b.endedAt }];
    b.points = Array.from({ length: 50000 }, (_, i) => ({
      ...b.points[0]!,
      timestamp: b.startedAt + i * 1000,
      longitude: -35.735 + i * 0.000001,
      speed: 1,
    }));
    const { manifest, batch } = uploadParts(b);
    const path = `/rides/sync/${b.clientId}`;
    await call('POST', path, manifest, alice);
    for (let i = 99; i >= 0; i--)
      expect(
        (await call('POST', `${path}/batches/${i}`, batch(i), alice))
          .statusCode,
      ).toBe(200);
    const done = await call('POST', `${path}/complete`, {}, alice);
    expect(done.statusCode).toBe(200);
    expect(
      (
        await pool.query('SELECT count(*) FROM ride_points WHERE ride_id=$1', [
          done.json().id,
        ])
      ).rows[0].count,
    ).toBe('50000');
  }, 60_000);
  it('salva múltiplos eventos pessoais, metadados e resumo verificado, com idempotência concorrente e propriedade', async () => {
    const b = telemetryFixture();
    b.motorcycleId = bike;
    b.visibility = 'public';
    b.telemetry = analyzeTelemetry(b);
    const responses = await Promise.all([
      call('POST', '/rides', b, alice),
      call('POST', '/rides', b, alice),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    const id = responses[0]!.json().id;
    const detail = await call('GET', `/rides/${id}`, undefined, alice);
    expect(detail.json().telemetry).toEqual(b.telemetry);
    expect(
      (await pool.query('SELECT count(*) FROM ride_performance_events')).rows[0]
        .count,
    ).toBe('2');
    expect((await call('GET', `/rides/${id}`, undefined, bob)).statusCode).toBe(
      404,
    );
    expect((await call('GET', `/rides/${id}`)).statusCode).toBe(401);
    expect(
      (await call('GET', '/rides', undefined, alice)).json().rides[0].telemetry,
    ).toBeUndefined();
    b.telemetry.events[0]!.durationMs = 1;
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(400);
  });
  it('rollback de evento remove sessão, GPS e sensores; nova tentativa salva integralmente', async () => {
    const b = telemetryFixture();
    b.motorcycleId = bike;
    b.motion = motionFixture(b.startedAt);
    b.telemetry = analyzeTelemetry(b);
    await pool.query(
      `CREATE FUNCTION reject_performance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event failure'; END $$`,
    );
    await pool.query(
      'CREATE TRIGGER reject_performance BEFORE INSERT ON ride_performance_events FOR EACH ROW EXECUTE FUNCTION reject_performance()',
    );
    try {
      expect((await call('POST', '/rides', b, alice)).statusCode).toBe(500);
      for (const table of [
        'rides',
        'ride_points',
        'ride_motion',
        'ride_motion_samples',
        'ride_performance_events',
      ])
        expect(
          (await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
        ).toBe('0');
    } finally {
      await pool.query(
        'DROP TRIGGER reject_performance ON ride_performance_events',
      );
      await pool.query('DROP FUNCTION reject_performance()');
    }
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(201);
  });
  it('migração preserva compatibilidade antiga e impede eventos órfãos ou duplicados', async () => {
    const old = await call('POST', '/rides', activity(), alice);
    expect(
      (await call('GET', `/rides/${old.json().id}`, undefined, alice)).json()
        .telemetry,
    ).toBeNull();
    const b = telemetryFixture();
    b.motorcycleId = bike;
    b.telemetry = analyzeTelemetry(b);
    const id = (await call('POST', '/rides', b, alice)).json().id;
    await expect(
      pool.query(
        'INSERT INTO ride_performance_events SELECT * FROM ride_performance_events WHERE ride_id=$1',
        [id],
      ),
    ).rejects.toThrow(/unique|duplicad/i);
    await expect(
      pool.query(
        'UPDATE ride_performance_events SET ride_id=$1 WHERE ride_id=$2',
        [randomUUID(), id],
      ),
    ).rejects.toThrow(/foreign key|estrangeira/i);
  });
  it('salva velocidade separada, repete idempotentemente e restringe acesso', async () => {
    const b = activity();
    b.speedProcessing = {
      version: 'speed-1',
      truncated: false,
      samples: [
        {
          relativeMs: 100,
          gpsTimestamp: b.startedAt,
          speedMps: 11,
          source: 'assisted',
          state: 'assisted',
          reason: null,
          stationary: false,
        },
      ],
    };
    const saved = await call('POST', '/rides', b, alice);
    expect(saved.statusCode, saved.body).toBe(201);
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(200);
    const detail = await call(
      'GET',
      `/rides/${saved.json().id}`,
      undefined,
      alice,
    );
    expect(detail.json().speedProcessing).toEqual(b.speedProcessing);
    expect(detail.json().ride.maximum_kmh).toBe(36);
    expect(detail.json().points[0].speed).toBe(10);
    expect(
      (await call('GET', `/rides/${saved.json().id}`, undefined, bob))
        .statusCode,
    ).toBe(404);
    expect((await pool.query('SELECT count(*) FROM rides')).rows[0].count).toBe(
      '1',
    );
    const changed = structuredClone(b);
    changed.speedProcessing!.samples[0]!.speedMps = 12;
    expect((await call('POST', '/rides', changed, alice)).statusCode).toBe(409);
  });
  it('preferência assistida padrão, GPS Puro por conta e proteção CSRF', async () => {
    expect(
      (await call('GET', '/auth/me', undefined, alice)).json().user.telemetry
        .speedMode,
    ).toBe('assisted');
    expect(
      (await call('PATCH', '/users/me/telemetry', { speedMode: 'pure' }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await call(
          'PATCH',
          '/users/me/telemetry',
          { speedMode: 'pure' },
          alice,
          { 'x-csrf-token': '' },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'PATCH',
          '/users/me/telemetry',
          { speedMode: 'invalid' },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await call('PATCH', '/users/me/telemetry', { speedMode: 'pure' }, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/auth/me', undefined, alice)).json().user.telemetry
        .speedMode,
    ).toBe('pure');
    expect(
      (await call('GET', '/auth/me', undefined, bob)).json().user.telemetry
        .speedMode,
    ).toBe('assisted');
    await call(
      'PATCH',
      '/users/me/telemetry',
      { speedMode: 'assisted' },
      alice,
    );
  });
  it('rollback também abrange série de velocidade quando sua gravação falha', async () => {
    const b = activity();
    b.speedProcessing = { version: 'speed-1', truncated: false, samples: [] };
    await pool.query(
      `CREATE FUNCTION reject_speed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'speed failure'; END $$`,
    );
    await pool.query(
      'CREATE TRIGGER reject_speed BEFORE UPDATE OF speed_processing ON rides FOR EACH ROW EXECUTE FUNCTION reject_speed()',
    );
    try {
      expect((await call('POST', '/rides', b, alice)).statusCode).toBe(500);
      expect(
        (await pool.query('SELECT count(*) FROM rides')).rows[0].count,
      ).toBe('0');
      expect(
        (await pool.query('SELECT count(*) FROM ride_points')).rows[0].count,
      ).toBe('0');
    } finally {
      await pool.query('DROP TRIGGER reject_speed ON rides');
      await pool.query('DROP FUNCTION reject_speed()');
    }
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(201);
  });
  it('persiste geografia SRID4326 e métricas recalculadas; consulta os próprios dados', async () => {
    const b = activity();
    const response = await call(
      'POST',
      '/rides',
      { ...b, distanceMeters: 999999, maximumKmh: 99999, ownerId: bob.id },
      alice,
    );
    expect(response.statusCode, response.body).toBe(201);
    const id = response.json().id;
    const detail = await call('GET', `/rides/${id}`, undefined, alice);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().points).toHaveLength(3);
    expect(detail.json().ride.owner_id).toBe(alice.id);
    expect(detail.json().ride.maximum_kmh).toBe(36);
    expect(detail.json().ride.distance_meters).toBeLessThan(30);
    expect(
      (
        await pool.query(
          'SELECT public.ST_SRID(position::public.geometry) AS srid FROM ride_points LIMIT 1',
        )
      ).rows[0].srid,
    ).toBe(4326);
    const list = await call('GET', '/rides', undefined, alice);
    expect(list.json().rides).toHaveLength(1);
    expect(list.json().rides[0].points).toBeUndefined();
    expect(
      (await call('GET', '/rides', undefined, bob)).json().rides,
    ).toHaveLength(0);
  });
  it.each(['public', 'private'] as const)(
    'restringe coordenadas %s ao proprietário',
    async (visibility) => {
      const b = activity();
      b.visibility = visibility;
      const id = (await call('POST', '/rides', b, alice)).json().id;
      expect(
        (await call('GET', `/rides/${id}`, undefined, bob)).statusCode,
      ).toBe(404);
      expect((await call('GET', `/rides/${id}`)).statusCode).toBe(401);
    },
  );
  it('exige autenticação, CSRF e origem autorizada', async () => {
    expect((await call('POST', '/rides', activity())).statusCode).toBe(401);
    expect(
      (await call('POST', '/rides', activity(), alice, { 'x-csrf-token': '' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await call('POST', '/rides', activity(), alice, {
          origin: 'https://other.example',
        })
      ).statusCode,
    ).toBe(403);
    expect((await call('GET', '/rides')).statusCode).toBe(401);
  });
  it('rejeita associação com moto de outra conta', async () => {
    expect((await call('POST', '/rides', activity(), bob)).statusCode).toBe(
      404,
    );
  });
  it('idempotência sequencial e concorrente cria somente um registro', async () => {
    const b = activity();
    const results = await Promise.all([
      call('POST', '/rides', b, alice),
      call('POST', '/rides', b, alice),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(results[0]!.json().id).toBe(results[1]!.json().id);
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(200);
    expect((await pool.query('SELECT count(*) FROM rides')).rows[0].count).toBe(
      '1',
    );
    expect(
      (await pool.query('SELECT count(*) FROM ride_points')).rows[0].count,
    ).toBe('3');
    expect(
      (await call('POST', '/rides', { ...b, visibility: 'private' }, alice))
        .statusCode,
    ).toBe(409);
  });
  it('mesma chave em contas diferentes não revela identificador', async () => {
    const b = activity();
    await call('POST', '/rides', b, alice);
    expect((await call('POST', '/rides', b, bob)).statusCode).toBe(404);
  });
  it('arquivamento preserva histórico e repetição do pedido confirmado', async () => {
    const b = activity();
    const id = (await call('POST', '/rides', b, alice)).json().id;
    expect(
      (await call('DELETE', `/motorcycles/${bike}`, undefined, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', `/rides/${id}`, undefined, alice)).json().points,
    ).toHaveLength(3);
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(200);
    expect((await call('POST', '/rides', activity(), alice)).statusCode).toBe(
      404,
    );
  });
  it('rollback remove sessão e pontos quando uma inserção falha e permite tentar novamente', async () => {
    await pool.query(`CREATE FUNCTION fail_ride_point() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.point_order=1 THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail BEFORE INSERT ON ride_points FOR EACH ROW EXECUTE FUNCTION fail_ride_point()`);
    const b = activity();
    try {
      expect((await call('POST', '/rides', b, alice)).statusCode).toBe(500);
      expect(
        (await pool.query('SELECT count(*) FROM rides')).rows[0].count,
      ).toBe('0');
      expect(
        (await pool.query('SELECT count(*) FROM ride_points')).rows[0].count,
      ).toBe('0');
    } finally {
      await pool.query(
        'DROP TRIGGER test_fail ON ride_points; DROP FUNCTION fail_ride_point()',
      );
    }
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(201);
  });
  it('não aceita pontos na pausa ou métricas com trajetos inconsistentes', async () => {
    const b = activity();
    b.intervals = [{ start: b.startedAt, end: b.startedAt + 1000 }];
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(400);
  });
  it('salva sessão longa em lotes sem cortar pontos', async () => {
    const b = activity();
    b.startedAt = Date.now() - 51_000_000;
    b.endedAt = b.startedAt + 50_000_000;
    b.intervals = [{ start: b.startedAt, end: b.endedAt }];
    b.points = Array.from({ length: 50_000 }, (_, n) => ({
      ...b.points[0]!,
      timestamp: b.startedAt + n * 1000,
    }));
    const response = await call('POST', '/rides', b, alice);
    expect(response.statusCode, response.body).toBe(201);
    expect(
      (await pool.query('SELECT count(*) FROM ride_points')).rows[0].count,
    ).toBe('50000');
    const preview = (
      await call(
        'GET',
        `/rides/${response.json().id}/track?limit=1000`,
        undefined,
        alice,
      )
    ).json();
    expect(preview.originalPoints).toBe(50000);
    expect(
      preview.segments.reduce(
        (n: number, g: { points: unknown[] }) => n + g.points.length,
        0,
      ),
    ).toBeLessThanOrEqual(1000);
  }, 30_000);
  it('limite de pontos e paginação inválida são explícitos', async () => {
    const b = activity();
    b.points = Array(50_001).fill(b.points[0]);
    const response = await call('POST', '/rides', b, alice);
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/50000/);
    expect(
      (await call('GET', '/rides?offset=-1', undefined, alice)).statusCode,
    ).toBe(400);
  });
  it('persiste sensores, calibração e estatísticas na mesma transação, restritos ao proprietário', async () => {
    const b = activity();
    b.motion = motionFixture(b.startedAt);
    const response = await call('POST', '/rides', b, alice);
    expect(response.statusCode, response.body).toBe(201);
    const id = response.json().id;
    const detail = await call('GET', `/rides/${id}`, undefined, alice);
    expect(detail.json().motion.samples).toHaveLength(3);
    expect(detail.json().motion.calibration.mount).toBe('top-forward');
    expect(detail.json().motion.stats.maxAccelerationG).toBe(1);
    expect((await call('GET', `/rides/${id}`, undefined, bob)).statusCode).toBe(
      404,
    );
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(200);
    expect(
      (await pool.query('SELECT count(*) FROM ride_motion_samples')).rows[0]
        .count,
    ).toBe('3');
    b.motion.samples[0]!.longitudinal = 0;
    b.motion.samples[0]!.accelerationG = 0;
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(409);
  });
  it('falha no sensor faz rollback também da atividade e dos pontos GPS', async () => {
    await pool.query(`CREATE FUNCTION fail_motion_sample() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
      CREATE TRIGGER test_fail_motion BEFORE INSERT ON ride_motion_samples FOR EACH ROW EXECUTE FUNCTION fail_motion_sample()`);
    const b = activity();
    b.motion = motionFixture(b.startedAt);
    try {
      expect((await call('POST', '/rides', b, alice)).statusCode).toBe(500);
      for (const table of [
        'rides',
        'ride_points',
        'ride_motion',
        'ride_motion_samples',
      ])
        expect(
          (await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
        ).toBe('0');
    } finally {
      await pool.query(
        'DROP TRIGGER test_fail_motion ON ride_motion_samples; DROP FUNCTION fail_motion_sample()',
      );
    }
    expect((await call('POST', '/rides', b, alice)).statusCode).toBe(201);
  });
  it('consulta atividade anterior sem sensores e rejeita telemetria inválida sem gravar', async () => {
    const b = activity();
    const id = (await call('POST', '/rides', b, alice)).json().id;
    expect(
      (await call('GET', `/rides/${id}`, undefined, alice)).json().motion,
    ).toBeNull();
    const invalid = activity();
    invalid.motion = motionFixture(invalid.startedAt);
    invalid.motion.samples[0]!.relativeMs = -1;
    expect((await call('POST', '/rides', invalid, alice)).statusCode).toBe(400);
    expect((await pool.query('SELECT count(*) FROM rides')).rows[0].count).toBe(
      '1',
    );
  });
  it('salva o limite de 18.000 amostras em lotes sem perder a ordem temporal', async () => {
    const b = activity();
    b.startedAt = Date.now() - 3601000;
    b.endedAt = b.startedAt + 3600000;
    b.intervals = [{ start: b.startedAt, end: b.endedAt }];
    b.points = [{ ...b.points[0]!, timestamp: b.startedAt }];
    b.motion = motionFixture(b.startedAt);
    b.motion.samples = Array.from({ length: 18000 }, (_, n) => ({
      ...b.motion!.samples[0]!,
      sequence: n + 1,
      relativeMs: n * 200,
      eventTimestamp: n * 200,
    }));
    const response = await call('POST', '/rides', b, alice);
    expect(response.statusCode, response.body).toBe(201);
    const detail = (
      await call('GET', `/rides/${response.json().id}`, undefined, alice)
    ).json();
    expect(detail.motion.samples).toHaveLength(18000);
    expect(detail.motion.samples.at(-1).relative_ms).toBe('3599800');
    expect(detail.motion.stats.validSamples).toBe(18000);
  }, 30000);
  it('Etapa 6: congela identidade do início ao salvar depois de uma edição e preserva ao arquivar', async () => {
    const created = await call(
      'POST',
      '/motorcycles',
      {
        brand: 'Honda',
        model: 'CB 650R',
        year: 2026,
        propulsion: 'combustion',
        displacementCc: 649,
        versionName: 'E-Clutch',
        catalogVariantId: '66000000-0000-4000-8000-000000000002',
        catalogRevision: 1,
      },
      alice,
    );
    expect(created.statusCode, created.body).toBe(201);
    const motorcycleId = created.json().motorcycle.id;
    const b = { ...activity(), motorcycleId };
    await pool.query(
      "UPDATE motorcycle_identity_history SET effective_at=to_timestamp($2::double precision/1000)-interval '1 second' WHERE motorcycle_id=$1",
      [motorcycleId, b.startedAt],
    );
    expect(
      (
        await call(
          'PATCH',
          `/motorcycles/${motorcycleId}`,
          {
            catalogVariantId: null,
            catalogRevision: null,
            model: 'Identidade nova',
          },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    const saved = await call('POST', '/rides', b, alice);
    expect(saved.statusCode, saved.body).toBe(201);
    const snap = (
      await pool.query('SELECT motorcycle_snapshot FROM rides WHERE id=$1', [
        saved.json().id,
      ])
    ).rows[0].motorcycle_snapshot;
    expect(snap).toMatchObject({
      model: 'CB 650R',
      catalogRevision: 1,
      versionName: 'E-Clutch',
      identityAtStartVerified: true,
    });
    await call('DELETE', `/motorcycles/${motorcycleId}`, undefined, alice);
    expect(
      (
        await pool.query('SELECT motorcycle_snapshot FROM rides WHERE id=$1', [
          saved.json().id,
        ])
      ).rows[0].motorcycle_snapshot,
    ).toEqual(snap);
  });
});
