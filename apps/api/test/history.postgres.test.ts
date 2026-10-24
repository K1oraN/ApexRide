import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import type { RidePayload } from '@apex-ride/ride-core';
import { routeFixture } from './route-fixtures.js';
import { motionFixture } from './motion-fixtures.js';
import { telemetryFixture } from './telemetry-fixtures.js';
import { analyzeTelemetry } from '@apex-ride/ride-core/telemetry';
const url = process.env.TEST_DATABASE_URL,
  schema = `history_test_${randomUUID().replaceAll('-', '')}`;
let admin: pg.Pool, pool: pg.Pool, app: FastifyInstance;
type Session = { id: string; cookie: string; csrf: string };
let alice: Session, bob: Session, bike: string, otherBike: string;
function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  s?: Session,
) {
  return app.inject({
    method,
    url: '/api' + path,
    headers: {
      origin: 'http://127.0.0.1:5173',
      'x-apex-request': '1',
      ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}),
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
        email: name + '@example.com',
        password: 'frase de senha longa e segura',
        acceptTerms: true,
        termsVersion: 'prelaunch-draft',
        privacyVersion: 'prelaunch-draft',
      })
    ).statusCode,
  ).toBe(201);
  const r = await call('POST', '/auth/login', {
    email: name + '@example.com',
    password: 'frase de senha longa e segura',
  });
  return {
    id: r.json().user.id,
    cookie: String(r.headers['set-cookie']).split(';')[0]!,
    csrf: r.json().csrfToken,
  };
}
function payload(n = 0): RidePayload {
  const start = Date.now() - 86400000 * (n + 1);
  return {
    clientId: randomUUID(),
    motorcycleId: n % 2 ? otherBike : bike,
    mode: n % 2 ? 'pista' : 'passeio',
    visibility: n % 2 ? 'private' : 'public',
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
  };
}
async function save(n = 0) {
  const body = payload(n);
  const r = await call('POST', '/rides', body, alice);
  expect(r.statusCode).toBe(201);
  return { id: r.json().id as string, body };
}
describe.skipIf(!url)('Parte 12 histórico PostgreSQL/PostGIS', () => {
  it('13D serves original replay samples in bounded pages and epoch time with private caching', async () => {
    const { id, body } = await save();
    const meta = await call('GET', `/rides/${id}/replay`, undefined, alice);
    expect(meta.statusCode).toBe(200);
    expect(meta.headers['cache-control']).toBe('private, no-store');
    expect(meta.json()).toMatchObject({
      version: 'replay-1',
      payload: {
        startedAt: body.startedAt,
        endedAt: body.endedAt,
        intervals: body.intervals,
        points: [],
        motion: null,
        speedProcessing: null,
      },
    });
    const first = (
      await call(
        'GET',
        `/rides/${id}/replay?kind=gps&limit=2`,
        undefined,
        alice,
      )
    ).json();
    expect(first).toMatchObject({ page: 1, hasMore: true });
    expect(first.items).toEqual(body.points.slice(0, 2));
    const last = (
      await call(
        'GET',
        `/rides/${id}/replay?kind=gps&limit=2&page=2`,
        undefined,
        alice,
      )
    ).json();
    expect(last).toMatchObject({ hasMore: false, items: [body.points[2]] });
    expect(
      (
        await call('GET', `/rides/${id}/replay?kind=speed`, undefined, alice)
      ).json().items,
    ).toEqual([]);
  });
  it('13D replay requires authentication, owner and non-deleted activity for every page', async () => {
    const { id } = await save();
    for (const kind of ['meta', 'gps', 'motion', 'speed']) {
      expect(
        (await call('GET', `/rides/${id}/replay?kind=${kind}`)).statusCode,
      ).toBe(401);
      expect(
        (await call('GET', `/rides/${id}/replay?kind=${kind}`, undefined, bob))
          .statusCode,
      ).toBe(404);
    }
    await call('DELETE', `/rides/${id}`, undefined, alice);
    expect(
      (await call('GET', `/rides/${id}/replay`, undefined, alice)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/rides/${randomUUID()}/replay`, undefined, alice))
        .statusCode,
    ).toBe(404);
  });
  it('13D paginates motion and stored speed without interpreting the raw event clock', async () => {
    const body = telemetryFixture();
    body.motorcycleId = bike;
    body.motion = motionFixture(body.startedAt);
    const id = (await call('POST', '/rides', body, alice)).json().id;
    const sample = {
      relativeMs: 100,
      gpsTimestamp: body.startedAt,
      speedMps: 10,
      source: 'assisted',
      state: 'assisted',
      reason: null,
      stationary: false,
    };
    await pool.query('UPDATE rides SET speed_processing=$2 WHERE id=$1', [
      id,
      JSON.stringify({
        version: 'speed-1',
        truncated: false,
        samples: [sample, { ...sample, relativeMs: 200 }],
      }),
    ]);
    const speed = (
      await call(
        'GET',
        `/rides/${id}/replay?kind=speed&limit=1&page=2`,
        undefined,
        alice,
      )
    ).json();
    expect(speed).toMatchObject({
      hasMore: false,
      items: [{ ...sample, relativeMs: 200 }],
    });
    const motion = (
      await call(
        'GET',
        `/rides/${id}/replay?kind=motion&limit=1`,
        undefined,
        alice,
      )
    ).json();
    expect(motion.items[0]).toEqual(body.motion.samples[0]);
    expect(motion.hasMore).toBe(true);
  });
  it('13D rejects invalid replay pagination and keeps full samples out of list and public summary', async () => {
    const { id } = await save();
    for (const q of [
      'kind=unknown',
      'limit=0',
      'limit=2001',
      'page=-1',
      'page=1.5',
      'page=10001',
      'kind[]=gps',
    ])
      expect(
        (await call('GET', `/rides/${id}/replay?${q}`, undefined, alice))
          .statusCode,
      ).toBe(400);
    const list = (await call('GET', '/rides', undefined, alice)).json();
    expect(list.rides[0].points).toBeUndefined();
    await call(
      'PATCH',
      '/users/me/privacy',
      { profileVisibility: 'public' },
      alice,
    );
    const summary = (await call('GET', `/public/rides/${id}`)).json();
    expect(summary.points).toBeUndefined();
    expect(JSON.stringify(summary)).not.toContain('relativeMs');
    expect((await call('GET', `/public/rides/${id}/replay`)).statusCode).toBe(
      404,
    );
  });
  it('12D agrega totais ponderados, modos, motos e meses sem duplicar nem incluir exclusões', async () => {
    const a = await save(),
      b = await save(1);
    await pool.query(
      "UPDATE rides SET distance_meters=1000,active_ms=100000,average_kmh=36,ended_at=started_at+interval '100 seconds',paused_ms=0 WHERE id=$1",
      [a.id],
    );
    await pool.query(
      'UPDATE rides SET distance_meters=1000,active_ms=10000,average_kmh=360,paused_ms=0 WHERE id=$1',
      [b.id],
    );
    const stats = (await call('GET', '/rides/stats', undefined, alice)).json();
    expect(stats.totals).toMatchObject({
      total: 2,
      distance_meters: 2000,
      active_ms: 110000,
      motorcycles: 2,
    });
    expect(stats.totals.average_kmh).toBeCloseTo((2000 * 3600) / 110000);
    expect(stats.modes).toHaveLength(2);
    expect(stats.months[0].total).toBe(2);
    expect(stats.motorcycles).toHaveLength(2);
    expect(
      (
        await call(
          'GET',
          '/rides/stats?mode=pista&motorcycleId=' + otherBike,
          undefined,
          alice,
        )
      ).json().totals.total,
    ).toBe(1);
    expect(
      (await call('GET', '/rides/stats', undefined, bob)).json().totals,
    ).toMatchObject({ total: 0, average_kmh: null });
    await call('DELETE', '/rides/' + a.id, undefined, alice);
    expect(
      (await call('GET', '/rides/stats', undefined, alice)).json().totals
        .distance_meters,
    ).toBe(1000);
  });
  it('12D reconcilia identificador local, protege outra conta e impede reenvio após cancelar antes do commit', async () => {
    const a = await save(),
      pending = payload();
    let response = (
      await call(
        'GET',
        '/rides/receipts?ids=' + [a.body.clientId, pending.clientId].join(','),
        undefined,
        alice,
      )
    ).json();
    expect(response.receipts).toEqual([
      { clientId: a.body.clientId, id: a.id, deleted: false },
    ]);
    expect(
      (
        await call(
          'GET',
          '/rides/receipts?ids=' + a.body.clientId,
          undefined,
          bob,
        )
      ).json().receipts,
    ).toEqual([]);
    expect(
      (
        await call(
          'DELETE',
          '/rides/by-client/' + pending.clientId,
          undefined,
          alice,
        )
      ).statusCode,
    ).toBe(200);
    expect((await call('POST', '/rides', pending, alice)).statusCode).toBe(410);
    expect(
      (
        await call(
          'POST',
          '/rides/sync/' + pending.clientId,
          {
            version: 1,
            meta: { ...pending, points: [] },
            counts: { points: 3, motion: 0, speed: 0, events: 0 },
          },
          alice,
        )
      ).statusCode,
    ).toBe(410);
    response = (
      await call(
        'GET',
        '/rides/receipts?ids=' + pending.clientId,
        undefined,
        alice,
      )
    ).json();
    expect(response.receipts[0]).toMatchObject({
      clientId: pending.clientId,
      deleted: true,
      id: null,
    });
  });
  it('12B/D recupera sensores e eventos persistidos com paginação e séries reduzidas', async () => {
    const b = telemetryFixture();
    b.motorcycleId = bike;
    b.motion = motionFixture(b.startedAt);
    b.telemetry = analyzeTelemetry(b);
    const saved = await call('POST', '/rides', b, alice);
    expect(saved.statusCode).toBe(201);
    const id = saved.json().id;
    const detail = (
      await call('GET', `/rides/${id}?view=summary`, undefined, alice)
    ).json().ride;
    expect(detail.motion.calibration.valid).toBe(true);
    expect(detail.motion.stats.maxAccelerationG).toBe(1);
    expect(detail.motion.samples).toBeUndefined();
    const events = (
      await call('GET', `/rides/${id}/events?limit=1`, undefined, alice)
    ).json();
    expect(events.items).toHaveLength(1);
    expect(events.hasMore).toBe(true);
    const series = (
      await call('GET', `/rides/${id}/telemetry`, undefined, alice)
    ).json();
    expect(series.series.force.length).toBeGreaterThan(0);
    expect(series.series.lean).toEqual([]);
  });
  it('12C edita apenas metadados próprios e conserva métricas técnicas', async () => {
    const { id } = await save();
    const before = (await call('GET', `/rides/${id}`, undefined, alice)).json();
    expect(
      (
        await call(
          'PATCH',
          `/rides/${id}`,
          {
            title: 'Passeio com amigos',
            description: 'Observação pessoal',
            visibility: 'private',
          },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    const after = (await call('GET', `/rides/${id}`, undefined, alice)).json();
    expect(after.ride.title).toBe('Passeio com amigos');
    expect(after.ride.distance_meters).toBe(before.ride.distance_meters);
    expect(after.points).toEqual(before.points);
    for (const b of [
      { distance_meters: 1 },
      { owner_id: bob.id },
      { mode: 'pista' },
      { title: 'x'.repeat(121) },
      { visibility: 'everyone' },
      {},
    ])
      expect((await call('PATCH', `/rides/${id}`, b, alice)).statusCode).toBe(
        400,
      );
    expect(
      (await call('PATCH', `/rides/${id}`, { title: 'Alheia' }, bob))
        .statusCode,
    ).toBe(404);
  });
  it('12C resumo público é whitelist sem título personalizado, localização ou telemetria', async () => {
    const { id } = await save();
    await call(
      'PATCH',
      `/rides/${id}`,
      {
        title: 'Minha casa -9.665 -35.735',
        description: 'Rua particular, endereço residencial',
      },
      alice,
    );
    const response = await call('GET', '/public/rides/' + id);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['x-robots-tag']).toBe('noindex, noarchive');
    const summary = response.json().summary;
    expect(Object.keys(summary).sort()).toEqual(
      [
        'active_minutes',
        'day',
        'distance_km',
        'locationPolicy',
        'mode',
        'rider',
        'title',
      ].sort(),
    );
    expect(summary.title).toContain('Passeio —');
    expect(JSON.stringify(summary)).not.toMatch(
      /Minha casa|particular|-35\.735|-9\.665|points|speed|route_snapshot|email|started_at/,
    );
  });
  it('12C revoga link imediatamente com atividade privada, perfil privado ou exclusão', async () => {
    const { id } = await save();
    expect((await call('GET', '/public/rides/' + id)).statusCode).toBe(200);
    await call('PATCH', '/rides/' + id, { visibility: 'private' }, alice);
    expect((await call('GET', '/public/rides/' + id)).statusCode).toBe(404);
    await call('PATCH', '/rides/' + id, { visibility: 'public' }, alice);
    expect((await call('GET', '/public/rides/' + id)).statusCode).toBe(200);
    await call(
      'PATCH',
      '/users/me/privacy',
      { profileVisibility: 'private' },
      alice,
    );
    expect((await call('GET', '/public/rides/' + id)).statusCode).toBe(404);
    await call(
      'PATCH',
      '/users/me/privacy',
      { profileVisibility: 'public' },
      alice,
    );
    expect((await call('GET', '/public/rides/' + id)).statusCode).toBe(200);
    expect(
      (await call('DELETE', '/rides/' + id, undefined, bob)).statusCode,
    ).toBe(404);
    await call('DELETE', '/rides/' + id, undefined, alice);
    expect((await call('GET', '/public/rides/' + id)).statusCode).toBe(404);
  });
  it('12C exclusão bloqueia todos os detalhes e não é revertida por reenvio offline', async () => {
    const { id, body } = await save();
    expect(
      (await call('DELETE', '/rides/' + id, undefined, alice)).statusCode,
    ).toBe(200);
    expect((await call('GET', '/rides', undefined, alice)).json().total).toBe(
      0,
    );
    for (const path of [
      `/rides/${id}`,
      `/rides/${id}?view=summary`,
      `/rides/${id}/track`,
      `/rides/${id}/telemetry`,
      `/rides/${id}/events`,
      `/rides/${id}/laps`,
    ])
      expect((await call('GET', path, undefined, alice)).statusCode).toBe(404);
    expect((await call('POST', '/rides', body, alice)).statusCode).toBe(410);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM rides WHERE owner_id=$1',
          [alice.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('12B detalhes leves e mapa não carregam sensores completos; legado continua acessível', async () => {
    const { id } = await save();
    const summary = (
      await call('GET', `/rides/${id}?view=summary`, undefined, alice)
    ).json().ride;
    expect(summary).toMatchObject({
      point_count: 3,
      event_count: 0,
      lap_count: 0,
      motion: null,
    });
    expect(summary.speed_processing).toBeUndefined();
    expect(summary.request_hash).toBeUndefined();
    const track = (
      await call('GET', `/rides/${id}/track`, undefined, alice)
    ).json();
    expect(track.segments).toHaveLength(1);
    expect(track.originalPoints).toBe(3);
    expect(track.segments[0].points[0].longitude).toBe(-35.735);
    const data = (
      await call('GET', `/rides/${id}/telemetry`, undefined, alice)
    ).json();
    expect(data.series.gps).toHaveLength(3);
    expect(data.series.assisted).toEqual([]);
    expect(data.speed.assistedSamples).toBeNull();
    expect(data.speed.gpsSamples).toBeNull();
    expect(data.series.force).toEqual([]);
    expect(
      (await call('GET', `/rides/${id}/events`, undefined, alice)).json().items,
    ).toEqual([]);
    expect(
      (await call('GET', `/rides/${id}/laps`, undefined, alice)).json().items,
    ).toEqual([]);
    expect(
      (await call('GET', `/rides/${id}`, undefined, alice)).json().points,
    ).toHaveLength(3);
    for (const path of [
      `/rides/${id}?view=summary`,
      `/rides/${id}/track`,
      `/rides/${id}/telemetry`,
      `/rides/${id}/events`,
      `/rides/${id}/laps`,
    ])
      expect((await call('GET', path, undefined, bob)).statusCode).toBe(404);
  });
  beforeAll(async () => {
    const config = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      DATABASE_SSL: process.env.DATABASE_SSL ?? 'disable',
    });
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
    alice = await account('history_alice');
    bob = await account('history_bob');
    const b = {
      brand: 'Honda',
      model: 'CB 650R',
      year: 2024,
      displacementCc: 649,
    };
    bike = (await call('POST', '/motorcycles', b, alice)).json().motorcycle.id;
    otherBike = (
      await call('POST', '/motorcycles', { ...b, model: 'CRF 300L' }, alice)
    ).json().motorcycle.id;
  }, 20000);
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE social_reports,social_post_comments,social_post_likes,social_post_media,social_posts,ride_similarity_matches,ride_similarity_index,ride_laps,ride_upload_batches,ride_uploads,ride_performance_events,ride_motion_samples,ride_motion,ride_points,rides,xp_ledger,user_progress,user_achievements,personal_challenges,gamification_jobs,leaderboard_scores,gamification_projection_cursor,gamification_audit CASCADE',
    );
    await pool.query('UPDATE motorcycles SET archived_at=NULL');
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it('12A lista só atividades próprias, ordena e pagina sem carregar trajetos', async () => {
    const a = await save(),
      b = await save(1);
    expect(
      (await call('GET', '/rides', undefined, bob)).json().rides,
    ).toHaveLength(0);
    expect((await call('GET', '/rides')).statusCode).toBe(401);
    const r = (await call('GET', '/rides?limit=1', undefined, alice)).json();
    expect(r).toMatchObject({ total: 2, hasMore: true });
    expect(r.rides[0]).toMatchObject({
      id: a.id,
      title: expect.stringContaining('Passeio —'),
      motorcycle_snapshot: { model: 'CB 650R', historicalFallback: false },
    });
    expect(r.rides[0].points).toBeUndefined();
    expect(
      (
        await call(
          'GET',
          '/rides?q=' + encodeURIComponent(r.rides[0].title),
          undefined,
          alice,
        )
      ).json().rides[0].id,
    ).toBe(a.id);
    expect(
      (await call('GET', '/rides?limit=1&page=2', undefined, alice)).json()
        .rides[0].id,
    ).toBe(b.id);
    expect(
      (await call('GET', '/rides?sort=oldest', undefined, alice)).json()
        .rides[0].id,
    ).toBe(b.id);
  });
  it('12A combina período, modo, moto, visibilidade e pesquisa', async () => {
    const a = await save(),
      b = await save(1);
    await pool.query(
      "UPDATE rides SET title='Serra tranquila',description='Passeio pessoal' WHERE id=$1",
      [a.id],
    );
    const qs = new URLSearchParams({
      mode: 'passeio',
      motorcycleId: bike,
      visibility: 'public',
      from: new Date(Date.now() - 1.5 * 86400000).toISOString(),
      to: new Date().toISOString(),
      q: 'tranquila',
    });
    expect(
      (await call('GET', '/rides?' + qs, undefined, alice))
        .json()
        .rides.map((r: { id: string }) => r.id),
    ).toEqual([a.id]);
    expect(
      (await call('GET', '/rides?q=CRF', undefined, alice)).json().rides[0].id,
    ).toBe(b.id);
  });
  it('12A preserva identificação da moto arquivada e filtros de rota', async () => {
    const a = await save();
    const route = (await call('POST', '/routes', routeFixture(), alice)).json()
      .route;
    await pool.query(
      'UPDATE rides SET route_id=$1,route_snapshot=$2 WHERE id=$3',
      [route.id, JSON.stringify({ name: 'Rota histórica' }), a.id],
    );
    await call('DELETE', '/routes/' + route.id, undefined, alice);
    await call('DELETE', '/motorcycles/' + bike, undefined, alice);
    expect(
      (await call('GET', '/rides?routeId=' + route.id, undefined, alice)).json()
        .rides[0].route_name,
    ).toBe('Rota histórica');
    expect(
      (await call('GET', '/rides?routeId=none', undefined, alice)).json().total,
    ).toBe(0);
    const options = (
      await call('GET', '/rides/filters', undefined, alice)
    ).json();
    expect(options.motorcycles[0].motorcycle.model).toBe('CB 650R');
    expect(options.routes[0].name).toBe('Rota histórica');
  });
  it('12A valida limites, datas e ordenação não competitiva', async () => {
    for (const q of [
      'offset=-1',
      'limit=51',
      'page=0',
      'sort=speed',
      'mode=other',
      'motorcycleId=invalid',
      'from=not-date',
      'from=2026-10-20T00:00:00Z&to=2026-10-19T00:00:00Z',
    ])
      expect(
        (await call('GET', '/rides?' + q, undefined, alice)).statusCode,
      ).toBe(400);
  });
});
