import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { routeFixture, circuitFixture, lapPoints } from './route-fixtures.js';
const url = process.env.TEST_DATABASE_URL;
const schema = `routes_test_${randomUUID().replaceAll('-', '')}`;
let admin: pg.Pool, pool: pg.Pool, app: FastifyInstance;
type Session = { cookie: string; csrf: string; id: string };
let alice: Session, bob: Session;
export function fixture() {
  return routeFixture();
}
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
async function authorizeReviewer(userIds: string[]) {
  for (const user of userIds) {
    await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [
      user,
    ]);
    await pool.query(
      "INSERT INTO admin_user_roles(id,user_id,role_code,granted_by) VALUES($1,$2,'route_reviewer',$2) ON CONFLICT(user_id,role_code) WHERE revoked_at IS NULL DO NOTHING",
      [randomUUID(), user],
    );
    await pool.query(
      "INSERT INTO admin_sessions(session_id,user_id) SELECT id,user_id FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL ON CONFLICT(session_id) DO UPDATE SET verified_at=now(),expires_at=now()+interval '30 minutes',revoked_at=NULL",
      [user],
    );
  }
}
async function seed(
  status = 'approved',
  kind = 'route',
  name = 'Litoral de Alagoas',
) {
  const id = randomUUID();
  const b = fixture();
  await pool.query(
    `INSERT INTO routes(id,owner_id,kind,name,city,state,geometry,distance_meters,source,status) VALUES($1,$2,$3,$4,$5,$6,public.ST_SetSRID(public.ST_GeomFromGeoJSON($7),4326),1100,'manual',$8)`,
    [
      id,
      alice.id,
      kind,
      name,
      b.city,
      b.state,
      JSON.stringify(b.geometry),
      status,
    ],
  );
  return id;
}
describe.skipIf(!url)('Parte 11 PostgreSQL/PostGIS', () => {
  it('11D recalcula voltas no servidor, persiste qualidade e ignora voltas forjadas', async () => {
    const data = circuitFixture();
    const created = await call('POST', '/circuits', data, alice);
    expect(created.statusCode).toBe(201);
    const id = created.json().route.id;
    await call('POST', `/routes/${id}/submit`, {}, alice);
    await authorizeReviewer([bob.id]);
    await call(
      'POST',
      `/admin/routes/${id}/decisions`,
      { action: 'approve', reason: 'Circuito sintético de teste', version: 1 },
      bob,
    );
    await call(
      'POST',
      `/admin/routes/${id}/decisions`,
      {
        action: 'verify',
        reason: 'Geometria sintética fechada de teste',
        version: 1,
        closedVenue: true,
        evidence:
          'Documento sintético: instalação fechada autorizada, geometria, linha e sentido revisados.',
      },
      bob,
    );
    const r = (await call('GET', '/routes/' + id)).json().route;
    const plan = {
      id: r.id,
      version: r.version,
      name: r.name,
      kind: r.kind,
      geometry: r.geometry,
      distanceMeters: r.distanceMeters,
      verification: r.verification,
      startLine: r.startLine,
      direction: r.direction,
    };
    const bike = (
      await call(
        'POST',
        '/motorcycles',
        { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
        alice,
      )
    ).json().motorcycle.id;
    const start = Date.now() - 180000;
    await pool.query(
      'UPDATE route_versions SET verified_at=to_timestamp($1::float8/1000) WHERE route_id=$2',
      [start - 10000, id],
    );
    const b = {
      clientId: randomUUID(),
      motorcycleId: bike,
      mode: 'pista',
      visibility: 'private',
      startedAt: start,
      endedAt: start + 120000,
      intervals: [{ start, end: start + 120000 }],
      points: lapPoints(start),
      route: { plan, abandoned: false },
      laps: [{ durationMs: 1 }],
    };
    const saved = await call('POST', '/rides', b, alice);
    expect(saved.statusCode).toBe(201);
    const laps = (
      await pool.query(
        'SELECT duration_ms,quality,status FROM ride_laps WHERE ride_id=$1 ORDER BY lap_number',
        [saved.json().id],
      )
    ).rows;
    expect(laps).toHaveLength(2);
    expect(Number(laps[0].duration_ms)).toBe(40000);
    expect(laps[0].quality.estimated).toBe(true);
    const historyLaps = (
      await call('GET', `/rides/${saved.json().id}/laps`, undefined, alice)
    ).json();
    expect(historyLaps.items).toHaveLength(2);
    expect(historyLaps.items[0].durationMs).toBe(40000);
    const history = (
      await call(
        'GET',
        `/rides/${saved.json().id}?view=summary`,
        undefined,
        alice,
      )
    ).json().ride;
    expect(history).toMatchObject({ lap_count: 2, best_lap_ms: 40000 });
    const late = Date.now();
    await pool.query(
      'UPDATE route_versions SET verified_at=to_timestamp($1::float8/1000) WHERE route_id=$2',
      [late, id],
    );
    const earlier = await call(
      'POST',
      '/rides',
      { ...b, clientId: randomUUID() },
      alice,
    );
    expect(earlier.statusCode).toBe(201);
    expect(
      (
        await pool.query('SELECT * FROM ride_laps WHERE ride_id=$1', [
          earlier.json().id,
        ])
      ).rows,
    ).toHaveLength(0);
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
    alice = await account('routes_alice');
    bob = await account('routes_bob');
  }, 20000);
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE admin_user_roles,admin_sessions,circuit_verification_evidence,moderation_cases CASCADE',
    );
    await pool.query(
      'TRUNCATE gamification_ride_facts,gamification_ride_decisions,xp_ledger,user_progress,user_achievements,personal_challenges,gamification_jobs,leaderboard_scores,gamification_projection_cursor,gamification_audit CASCADE',
    );
    await pool.query(
      'DELETE FROM ride_laps; DELETE FROM ride_points; DELETE FROM rides; DELETE FROM route_decisions; DELETE FROM route_favorites; DELETE FROM route_waypoints; DELETE FROM route_versions; DELETE FROM routes; DELETE FROM route_moderators',
    );
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it('11A retorna só aprovados; oculta rascunhos e rejeitados', async () => {
    await seed();
    const draft = await seed('draft');
    await seed('rejected');
    expect((await call('GET', '/routes')).json().routes).toHaveLength(1);
    expect((await call('GET', '/routes/' + draft)).statusCode).toBe(404);
    expect(
      (await call('GET', '/routes/' + draft, undefined, bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/routes/' + draft, undefined, alice)).statusCode,
    ).toBe(200);
  });
  it('11A pesquisa nome, cidade, tipo e pagina', async () => {
    await seed();
    await seed('approved', 'circuit', 'Pista sintética');
    expect((await call('GET', '/routes?q=Litoral')).json().routes).toHaveLength(
      1,
    );
    expect((await call('GET', '/circuits')).json().routes).toHaveLength(1);
    expect(
      (await call('GET', '/routes?city=Macei%C3%B3&limit=1')).json().hasMore,
    ).toBe(true);
    expect(
      (await call('GET', '/routes?page=2&limit=1')).json().routes,
    ).toHaveLength(1);
  });
  it('11A proximidade usa metros e bbox indexável', async () => {
    await seed();
    expect(
      (
        await call('GET', '/routes/nearby?lon=-35.73&lat=-9.66&radius=100')
      ).json().routes,
    ).toHaveLength(1);
    expect(
      (await call('GET', '/routes/nearby?lon=-36&lat=-10&radius=100')).json()
        .routes,
    ).toHaveLength(0);
    expect(
      (await call('GET', '/routes?bbox=-35.8,-9.7,-35.7,-9.6')).json().routes,
    ).toHaveLength(1);
  });
  it('11B cria rascunho, calcula extensão e exige autenticação', async () => {
    expect((await call('POST', '/routes', fixture())).statusCode).toBe(401);
    const r = await call(
      'POST',
      '/routes',
      { ...fixture(), ownerId: bob.id, status: 'approved' },
      alice,
    );
    expect(r.statusCode).toBe(201);
    expect(r.json().route).toMatchObject({
      ownerId: alice.id,
      status: 'draft',
      source: 'manual',
    });
    expect(r.json().route.distanceMeters).toBeGreaterThan(1000);
    expect((await call('GET', '/routes')).json().routes).toHaveLength(0);
    expect(
      (await call('GET', '/routes/mine', undefined, alice)).json().routes,
    ).toHaveLength(1);
  });
  it('11B preserva ordem das paradas e protege edição/arquivamento', async () => {
    const data = {
      ...fixture(),
      waypoints: [
        [-35.73, -9.66],
        [-35.725, -9.66],
        [-35.72, -9.66],
      ],
    };
    const created = await call('POST', '/routes', data, alice);
    const id = created.json().route.id;
    expect(created.json().route.waypoints).toEqual(data.waypoints);
    expect((await call('PATCH', '/routes/' + id, data, bob)).statusCode).toBe(
      404,
    );
    const reversed = {
      ...data,
      waypoints: [...data.waypoints].reverse(),
      geometry: {
        type: 'LineString',
        coordinates: [...data.geometry.coordinates].reverse(),
      },
    };
    expect(
      (await call('PATCH', '/routes/' + id, reversed, alice)).json().route
        .waypoints,
    ).toEqual(reversed.waypoints);
    expect(
      (await call('DELETE', '/routes/' + id, undefined, bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('DELETE', '/routes/' + id, undefined, alice)).statusCode,
    ).toBe(200);
    expect(
      (await pool.query('SELECT status FROM routes WHERE id=$1', [id])).rows[0]
        .status,
    ).toBe('archived');
  });
  it('11B moderação exige papel no banco, motivo e versão', async () => {
    const id = (await call('POST', '/routes', fixture(), alice)).json().route
      .id;
    expect(
      (await call('POST', `/routes/${id}/submit`, {}, alice)).statusCode,
    ).toBe(200);
    const decision = {
      action: 'approve',
      reason: 'Revisão sintética de teste',
      version: 1,
    };
    expect(
      (await call('POST', `/admin/routes/${id}/decisions`, decision, bob))
        .statusCode,
    ).toBe(403);
    await authorizeReviewer([alice.id, bob.id]);
    expect(
      (await call('POST', `/admin/routes/${id}/decisions`, decision, alice))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/admin/routes/${id}/decisions`,
          { ...decision, version: 2 },
          bob,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (await call('POST', `/admin/routes/${id}/decisions`, decision, bob))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await call('GET', `/admin/routes/${id}/decisions`, undefined, bob)
      ).json().decisions,
    ).toHaveLength(1);
    expect(
      (await call('PATCH', '/routes/' + id, fixture(), alice)).json().route,
    ).toMatchObject({ status: 'draft', version: 2, verification: 'suggested' });
    expect((await call('GET', '/routes')).json().routes).toHaveLength(0);
  });
  it('11B favoritos são idempotentes e isolados por usuário', async () => {
    const id = await seed(),
      draft = await seed('draft');
    expect((await call('POST', `/routes/${id}/favorite`, {})).statusCode).toBe(
      401,
    );
    for (let i = 0; i < 2; i++)
      expect(
        (await call('POST', `/routes/${id}/favorite`, {}, alice)).statusCode,
      ).toBe(200);
    expect(
      (await call('POST', `/routes/${draft}/favorite`, {}, alice)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/routes/favorites', undefined, alice)).json()
        .routes[0],
    ).toMatchObject({ favorite: true, favorites: 1 });
    await call('DELETE', `/routes/${id}/favorite`, undefined, bob);
    expect(
      (await call('GET', '/routes/favorites', undefined, alice)).json().routes,
    ).toHaveLength(1);
    await call('DELETE', `/routes/${id}/favorite`, undefined, alice);
    expect(
      (await call('GET', '/routes/favorites', undefined, alice)).json().routes,
    ).toHaveLength(0);
  });
  it('11B circuitos têm publicação e verificação distintas', async () => {
    const coordinates: [number, number][] = [
      [-35.73, -9.66],
      [-35.72, -9.66],
      [-35.72, -9.65],
      [-35.73, -9.65],
      [-35.73, -9.66],
    ];
    const data = {
      ...fixture(),
      geometry: { type: 'LineString', coordinates },
      waypoints: [coordinates[0], coordinates.at(-1)],
      startLine: {
        type: 'LineString',
        coordinates: [
          [-35.725, -9.6599],
          [-35.725, -9.6601],
        ],
      },
      direction: 1,
    };
    const r = await call('POST', '/circuits', data, alice);
    expect(r.statusCode).toBe(201);
    const id = r.json().route.id;
    await call('POST', `/routes/${id}/submit`, {}, alice);
    await authorizeReviewer([bob.id]);
    expect(
      (
        await call(
          'POST',
          `/admin/routes/${id}/decisions`,
          {
            action: 'verify',
            version: 1,
            reason: 'Área sintética fechada',
            closedVenue: true,
            evidence:
              'Documento sintético: instalação fechada autorizada, geometria, linha e sentido revisados.',
          },
          bob,
        )
      ).statusCode,
    ).toBe(400);
    await call(
      'POST',
      `/admin/routes/${id}/decisions`,
      { action: 'approve', version: 1, reason: 'Publicação sintética' },
      bob,
    );
    expect(
      (await call('GET', '/circuits/' + id)).json().route.verification,
    ).toBe('suggested');
    expect(
      (
        await call(
          'POST',
          `/admin/routes/${id}/decisions`,
          {
            action: 'verify',
            version: 1,
            reason: 'Área sintética fechada',
            closedVenue: true,
            evidence:
              'Documento sintético: instalação fechada autorizada, geometria, linha e sentido revisados.',
          },
          bob,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/circuits/' + id)).json().route.verification,
    ).toBe('verified');
    expect(
      (await call('PATCH', '/circuits/' + id, data, alice)).json().route
        .verification,
    ).toBe('suggested');
  });
  it('11B falha do provedor não inventa geometria e limita tentativas', async () => {
    const points = fixture().waypoints;
    expect(
      (await call('POST', '/routes/calculate', { waypoints: points }, alice))
        .statusCode,
    ).toBe(503);
    for (let i = 0; i < 5; i++)
      await call('POST', '/routes/calculate', { waypoints: points }, alice);
    expect(
      (await call('POST', '/routes/calculate', { waypoints: points }, alice))
        .statusCode,
    ).toBe(429);
  });
  it('11C salva rota incompleta após arquivamento, separa GPS e protege atividade', async () => {
    const id = (await call('POST', '/routes', fixture(), alice)).json().route
      .id;
    await call('POST', `/routes/${id}/submit`, {}, alice);
    await authorizeReviewer([bob.id]);
    await call(
      'POST',
      `/admin/routes/${id}/decisions`,
      { action: 'approve', version: 1, reason: 'Revisão de teste' },
      bob,
    );
    const r = (await call('GET', '/routes/' + id)).json().route;
    const bike = (
      await call(
        'POST',
        '/motorcycles',
        { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
        alice,
      )
    ).json().motorcycle.id;
    const start = Date.now() - 60000;
    const plan = {
      id: r.id,
      version: r.version,
      name: r.name,
      kind: r.kind,
      geometry: r.geometry,
      distanceMeters: r.distanceMeters,
      verification: r.verification,
      startLine: r.startLine,
      direction: r.direction,
    };
    const b = {
      clientId: randomUUID(),
      motorcycleId: bike,
      mode: 'passeio',
      visibility: 'public',
      startedAt: start,
      endedAt: start + 5000,
      intervals: [{ start, end: start + 5000 }],
      points: [0, 1, 2].map((i) => ({
        longitude: -35.73 + i * 0.0001,
        latitude: -9.66,
        timestamp: start + i * 1000,
        accuracy: 5,
        speed: 10,
        heading: 90,
        altitude: null,
        segment: 0,
      })),
      route: { plan, abandoned: false },
    };
    await call('DELETE', '/routes/' + id, undefined, alice);
    const saved = await call('POST', '/rides', b, alice);
    expect(saved.statusCode).toBe(201);
    const detail = (
      await call('GET', '/rides/' + saved.json().id, undefined, alice)
    ).json();
    expect(detail.ride.route_id).toBe(id);
    expect(detail.ride.route_result.completion).toBe('partial');
    expect(detail.points).toHaveLength(3);
    const abandoned = await call(
      'POST',
      '/rides',
      {
        ...b,
        clientId: randomUUID(),
        route: { ...b.route, abandoned: true, abandonedAt: start + 1000 },
      },
      alice,
    );
    expect(abandoned.statusCode).toBe(201);
    const abandonedDetail = (
      await call('GET', '/rides/' + abandoned.json().id, undefined, alice)
    ).json();
    expect(abandonedDetail.ride.route_result.completion).toBe('abandoned');
    expect(abandonedDetail.points).toHaveLength(3);
    expect(abandonedDetail.ride.route_result.covered).toBeLessThan(
      detail.ride.route_result.covered,
    );
    expect(detail.ride.route_snapshot.geometry.coordinates).toHaveLength(2);
    expect(
      (await call('GET', '/rides/' + saved.json().id, undefined, bob))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'POST',
          '/rides',
          {
            ...b,
            clientId: randomUUID(),
            route: {
              ...b.route,
              plan: {
                ...plan,
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-35, -9],
                    [-34, -9],
                  ],
                },
              },
            },
          },
          alice,
        )
      ).statusCode,
    ).toBe(400);
  });
});
