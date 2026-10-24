import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RidePayload } from '@apex-ride/ride-core';
import type { RoutePlan } from '@apex-ride/ride-core/routes';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { routeFixture, circuitFixture, lapPoints } from './route-fixtures.js';
import { motionFixture } from './motion-fixtures.js';
import {
  comparisonRoute,
  compareActivities,
} from '../src/modules/comparisons/service.js';
const url = process.env.TEST_DATABASE_URL,
  schema = `comparison_test_${randomUUID().replaceAll('-', '')}`;
let admin: pg.Pool, pool: pg.Pool, app: FastifyInstance;
type Session = { id: string; cookie: string; csrf: string; bike: string };
let alice: Session, bob: Session;
function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  s: Session | null = alice,
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
async function account(name: string): Promise<Session> {
  expect(
    (
      await call(
        'POST',
        '/auth/register',
        {
          displayName: name,
          username: name,
          email: name + '@example.com',
          password: 'senha longa e segura para testes',
          acceptTerms: true,
          termsVersion: 'prelaunch-draft',
          privacyVersion: 'prelaunch-draft',
        },
        null,
      )
    ).statusCode,
  ).toBe(201);
  const r = await call(
      'POST',
      '/auth/login',
      {
        email: name + '@example.com',
        password: 'senha longa e segura para testes',
      },
      null,
    ),
    s = {
      id: r.json().user.id,
      cookie: String(r.headers['set-cookie']).split(';')[0]!,
      csrf: r.json().csrfToken,
      bike: '',
    };
  s.bike = (
    await call(
      'POST',
      '/motorcycles',
      { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
      s,
    )
  ).json().motorcycle.id;
  return s;
}
async function route(circuit = false): Promise<RoutePlan> {
  const data = circuit ? circuitFixture() : routeFixture(),
    r = await call('POST', circuit ? '/circuits' : '/routes', data);
  expect(r.statusCode).toBe(201);
  const plan: RoutePlan = {
    ...r.json().route,
    verification: circuit ? 'verified' : 'suggested',
  };
  await pool.query(
    `UPDATE routes SET status='approved',verification=$2 WHERE id=$1`,
    [plan.id, plan.verification],
  );
  await pool.query(
    `INSERT INTO route_versions(route_id,version,plan,verified_at) VALUES($1,$2,$3,$4)`,
    [
      plan.id,
      plan.version,
      JSON.stringify(plan),
      circuit ? new Date(Date.now() - 86400000) : null,
    ],
  );
  return plan;
}
async function save(
  plan: RoutePlan,
  s = alice,
  options: {
    partial?: boolean;
    reverse?: boolean;
    motion?: boolean;
    mode?: 'misto' | 'pista' | 'passeio';
  } = {},
) {
  const start = Date.now() - 300000,
    points =
      plan.kind === 'circuit'
        ? lapPoints(start)
        : Array.from({ length: options.partial ? 51 : 101 }, (_, i) => ({
            longitude: -35.73 + (options.reverse ? 100 - i : i) * 0.0001,
            latitude: -9.66,
            timestamp: start + i * 1000,
            accuracy: 5,
            speed: 11,
            heading: 90,
            altitude: null,
            segment: 0,
          }));
  const payload: RidePayload = {
    clientId: randomUUID(),
    motorcycleId: s.bike,
    mode: options.mode ?? 'misto',
    visibility: 'public',
    startedAt: start,
    endedAt: points.at(-1)!.timestamp + 1000,
    intervals: [{ start, end: points.at(-1)!.timestamp + 1000 }],
    points,
    route: { plan, abandoned: false },
    ...(options.motion ? { motion: motionFixture(start) } : {}),
  };
  const r = await call('POST', '/rides', payload, s);
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}
const compare = (p: RoutePlan, ids: string[], s = alice) =>
  call('POST', `/routes/${p.id}/compare`, { activityIds: ids }, s);
describe.skipIf(!url)(
  '14A–14D PostgreSQL/PostGIS, autorização e revogação',
  () => {
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
      });
      await app.ready();
      alice = await account('comparison_alice');
      bob = await account('comparison_bob');
    }, 20000);
    beforeEach(async () => {
      await pool.query(
        'TRUNCATE social_reports,social_post_comments,social_post_likes,social_post_media,social_posts,ride_similarity_matches,ride_similarity_index,ride_laps,ride_upload_batches,ride_uploads,ride_performance_events,ride_motion_samples,ride_motion,ride_points,rides,xp_ledger,user_progress,user_achievements,personal_challenges,gamification_jobs,leaderboard_scores,gamification_projection_cursor,gamification_audit CASCADE',
      );
      await pool.query('TRUNCATE auth_rate_limits,motorcycle_model_categories');
      await pool.query(
        "UPDATE privacy_settings SET profile_visibility='public'",
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
    it('reavalia consentimento antes de responder após revogação durante o processamento', async () => {
      const p = await route(true),
        a = await save(p, alice, { mode: 'pista' }),
        b = await save(p, bob, { mode: 'pista' });
      await call(
        'PATCH',
        `/rides/${b}/comparison-privacy`,
        { enabled: true, technical: true },
        bob,
      );
      let revoked = false;
      const proxy = new Proxy(pool, {
        get(target, key) {
          if (key === 'query')
            return async (...args: unknown[]) => {
              const result = await Reflect.apply(target.query, target, args);
              if (
                !revoked &&
                typeof args[0] === 'string' &&
                args[0].includes('FROM ride_motion_samples')
              ) {
                revoked = true;
                await pool.query(
                  'UPDATE rides SET comparison_enabled=false,comparison_technical=false,comparison_revision=comparison_revision+1 WHERE id=$1',
                  [b],
                );
              }
              return result;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      await expect(
        compareActivities(
          proxy,
          await comparisonRoute(pool, p.id, alice.id),
          [a, b],
          alice.id,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(revoked).toBe(true);
    });
    it('preserva eventos 0–100/100–0 e fontes; versões Assistidas incompatíveis não produzem séries', async () => {
      const p = await route(),
        a = await save(p),
        b = await save(p),
        start = Date.now() - 300000;
      const sample = {
        relativeMs: 0,
        gpsTimestamp: start,
        speedMps: 10,
        source: 'assisted',
        state: 'assisted',
        reason: null,
        stationary: false,
      };
      await pool.query(
        `UPDATE rides SET speed_processing=$2 WHERE id=ANY($1::uuid[])`,
        [
          [a, b],
          JSON.stringify({
            version: 'speed-1',
            samples: [sample],
            truncated: false,
          }),
        ],
      );
      await pool.query(
        `INSERT INTO ride_performance_events(ride_id,id,type,start_ms,end_ms,duration_ms,status,reason,method,version,quality) VALUES($1,'event-a','acceleration',$2,$2::bigint+5000,5000,'estimated',NULL,'adjacent-linear-estimate','events-1','{"sources":["gps-direct"],"experimental":true}'),($1,'event-b','braking',$2::bigint+6000,$2::bigint+7000,NULL,'inconclusive','insufficient-data','adjacent-linear-estimate','events-1','{"sources":["gps-direct"],"experimental":true}')`,
        [a, start],
      );
      let r = await compare(p, [a, b]);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().activities[0].events).toMatchObject([
        { type: 'acceleration', status: 'estimated', durationMs: 5000 },
        { type: 'braking', status: 'inconclusive', durationMs: null },
      ]);
      expect(r.json().activities[0].summary).toMatchObject({
        activeMs: 101000,
        elapsedMs: 101000,
        pausedMs: 0,
        maximumKmh: 39.6,
      });
      await pool.query(
        `UPDATE rides SET speed_processing=jsonb_set(speed_processing,'{version}','"speed-future"') WHERE id=$1`,
        [b],
      );
      r = await compare(p, [a, b]);
      expect(
        r
          .json()
          .activities.every((a: { samples: { assisted: unknown }[] }) =>
            a.samples.every((s) => s.assisted === null),
          ),
      ).toBe(true);
      expect(r.json().limitations.join()).toContain(
        'GPS Assistido sem versões compatíveis',
      );
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM ride_performance_events WHERE ride_id=$1',
            [a],
          )
        ).rows[0].n,
      ).toBe(2);
    });
    it('seleciona/pagina apenas dados próprios sem carregar GPS e compara 2–4 sessões', async () => {
      const p = await route(),
        a = await save(p),
        b = await save(p),
        c = await save(p),
        d = await save(p);
      await save(p, bob);
      const page = await call(
        'GET',
        `/routes/${p.id}/comparison-candidates?limit=2`,
      );
      expect(page.statusCode, page.body).toBe(200);
      expect(page.json()).toMatchObject({ hasMore: true, maxActivities: 4 });
      expect(page.json().candidates).toHaveLength(2);
      expect(page.body).not.toContain('latitude');
      for (const ids of [
        [a, b],
        [a, b, c],
        [a, b, c, d],
      ]) {
        const r = await compare(p, ids);
        expect(r.statusCode, r.body).toBe(200);
        expect(r.json()).toMatchObject({
          state: 'full',
          activities: expect.any(Array),
        });
        expect(r.json().activities).toHaveLength(ids.length);
        expect(r.json().commonMeters).toBeGreaterThan(1000);
      }
    });
    it('recusa duplicatas, menos de duas, excesso, IDs inválidos e campos de confiança do cliente', async () => {
      const p = await route(),
        a = await save(p),
        b = await save(p);
      for (const ids of [
        [a, a],
        [a],
        [a, b, randomUUID(), randomUUID(), randomUUID()],
        ['invalid', b],
      ])
        expect((await compare(p, ids)).statusCode).toBe(400);
      expect(
        (
          await call('POST', `/routes/${p.id}/compare`, {
            activityIds: [a, b],
            public: true,
          })
        ).statusCode,
      ).toBe(400);
    });
    it('exige autenticação, CSRF e propriedade individual', async () => {
      const p = await route(),
        a = await save(p),
        b = await save(p);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/routes/${p.id}/comparison-candidates`,
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/routes/${p.id}/compare`,
            headers: { cookie: alice.cookie, 'x-apex-request': '1' },
            payload: { activityIds: [a, b] },
          })
        ).statusCode,
      ).toBe(403);
      expect((await compare(p, [a, b], bob)).statusCode).toBe(404);
      expect(
        (
          await call(
            'PATCH',
            `/rides/${a}/comparison-privacy`,
            { enabled: true, technical: false },
            bob,
          )
        ).statusCode,
      ).toBe(404);
    });
    it('atividades públicas não autorizam telemetria em vias comuns mesmo com opt-in', async () => {
      const p = await route(),
        a = await save(p),
        b = await save(p, bob);
      expect((await compare(p, [a, b])).statusCode).toBe(404);
      expect(
        (
          await call(
            'PATCH',
            `/rides/${b}/comparison-privacy`,
            { enabled: true, technical: false },
            bob,
          )
        ).statusCode,
      ).toBe(200);
      expect((await compare(p, [a, b])).statusCode).toBe(404);
      const r = await call(
        'GET',
        `/routes/${p.id}/comparison-candidates?scope=technical`,
      );
      expect(r.json().candidates).toEqual([]);
    });
    it('identifica parcial, inversa e lacuna sem inventar diferenças totais', async () => {
      const p = await route(),
        a = await save(p),
        b = await save(p, alice, { partial: true }),
        c = await save(p, alice, { reverse: true });
      const r = await compare(p, [a, b]);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().state).toBe('partial');
      expect(r.json().differences[1].distanceMeters).toBeNull();
      expect(r.json().activities[1].coverage).toBeLessThan(0.6);
      expect((await compare(p, [a, c])).json().state).toBe('none');
      await pool.query(
        'DELETE FROM ride_points WHERE ride_id=$1 AND point_order BETWEEN 40 AND 60',
        [a],
      );
      expect((await compare(p, [a, b])).json().state).toBe('limited');
    });
    it('mesma geometria em versões diferentes é compatível; alteração real é recusada', async () => {
      const p = await route(),
        a = await save(p),
        next = { ...p, version: 2 };
      await pool.query(
        'INSERT INTO route_versions(route_id,version,plan) VALUES($1,2,$2)',
        [p.id, JSON.stringify(next)],
      );
      const b = await save(next);
      expect((await compare(p, [a, b])).statusCode).toBe(200);
      await pool.query(
        `UPDATE rides SET route_snapshot=jsonb_set(route_snapshot,'{geometry,coordinates,1,0}','-35.71') WHERE id=$1`,
        [b],
      );
      expect((await compare(p, [a, b])).statusCode).toBe(422);
    });
    it('recusa outra rota, exclusão, rota arquivada e GPS ausente', async () => {
      const p = await route(),
        q = await route(),
        a = await save(p),
        b = await save(q);
      expect((await compare(p, [a, b])).statusCode).toBe(404);
      const c = await save(p);
      await pool.query('DELETE FROM ride_points WHERE ride_id=$1', [c]);
      expect((await compare(p, [a, c])).json().state).toBe('none');
      await call('DELETE', `/rides/${c}`);
      expect((await compare(p, [a, c])).statusCode).toBe(404);
      await call('DELETE', `/routes/${p.id}`);
      expect(
        (await call('GET', `/routes/${p.id}/comparison-candidates`)).statusCode,
      ).toBe(404);
    });
    it('filtra cilindrada e taxonomia verificada, preservando Não classificada', async () => {
      const p = await route();
      await save(p);
      const base = `/routes/${p.id}/comparison-candidates`;
      expect(
        (
          await call(
            'GET',
            base +
              '?ccBand=2&category=' +
              encodeURIComponent('Não classificada') +
              '&city=Macei%C3%B3&state=AL&region=Nordeste',
          )
        ).json().candidates,
      ).toHaveLength(1);
      for (const q of [
        'ccBand=0',
        'city=Recife',
        'state=PE',
        'region=Sul',
        'category=Naked',
        'model=unknown',
      ])
        expect(
          (await call('GET', base + '?' + q)).json().candidates,
        ).toHaveLength(0);
      await pool.query(
        "INSERT INTO motorcycle_model_categories VALUES('Honda','CB 650R','Naked','https://example.org/test-fixture',now())",
      );
      expect(
        (await call('GET', base + '?category=Naked')).json().candidates,
      ).toHaveLength(1);
    });
    it('compara dados G calibrados; sensor ausente/versão incompatível não vira zero', async () => {
      const p = await route(),
        a = await save(p, alice, { motion: true }),
        b = await save(p, alice, { motion: true }),
        c = await save(p);
      let r = await compare(p, [a, b]);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().activities[0].summary.motion.maxAccelerationG).toBe(1);
      expect(r.json().activities[0].summary.motion.maxLeft).toBeNull();
      r = await compare(p, [a, c]);
      expect(
        r
          .json()
          .activities.every(
            (a: { summary: { motion: unknown } }) => a.summary.motion === null,
          ),
      ).toBe(true);
      expect(
        r
          .json()
          .activities[0].samples.every(
            (s: { lean: unknown; force: unknown }) =>
              s.lean === null && s.force === null,
          ),
      ).toBe(true);
      await pool.query(
        "UPDATE ride_motion SET calibration=jsonb_set(calibration,'{valid}','false') WHERE ride_id=$1",
        [b],
      );
      expect(
        (await compare(p, [a, b])).json().activities[0].summary.motion,
      ).toBeNull();
    });
    it('circuito verificado permite telemetria autorizada sem GPS ou horários de terceiros e revoga imediatamente', async () => {
      const p = await route(true),
        a = await save(p, alice, { mode: 'pista' }),
        b = await save(p, bob, { mode: 'pista' });
      expect((await compare(p, [a, b])).statusCode).toBe(404);
      expect(
        (
          await call(
            'PATCH',
            `/rides/${b}/comparison-privacy`,
            { enabled: true, technical: true },
            bob,
          )
        ).statusCode,
      ).toBe(200);
      const r = await compare(p, [a, b]);
      expect(r.statusCode, r.body).toBe(200);
      const other = r.json().activities[1];
      expect(other.track).toEqual([]);
      expect(JSON.stringify(other)).not.toMatch(
        /latitude|longitude|timestamp|started_at|owner_id|startMs|endMs/,
      );
      expect(other.samples.length).toBeGreaterThan(5);
      const laps = await call('POST', `/circuits/${p.id}/compare-laps`, {
        activityIds: [a, b],
        lapNumbers: [1, 1],
      });
      expect(laps.statusCode, laps.body).toBe(200);
      expect(laps.json().activities[0].summary.lapMs).toBeGreaterThan(10000);
      expect(
        (
          await call(
            'PATCH',
            `/rides/${b}/comparison-privacy`,
            { enabled: false, technical: false },
            bob,
          )
        ).statusCode,
      ).toBe(200);
      expect((await compare(p, [a, b])).statusCode).toBe(404);
      expect(
        (await call('GET', `/rides/${b}?view=summary`, undefined, bob))
          .statusCode,
      ).toBe(200);
    });
    it('perfil/atividade privados bloqueiam autorização técnica anterior; contexto não verificado é recusado', async () => {
      const p = await route(true),
        a = await save(p, alice, { mode: 'pista' }),
        b = await save(p, bob, { mode: 'pista' });
      await call(
        'PATCH',
        `/rides/${b}/comparison-privacy`,
        { enabled: true, technical: true },
        bob,
      );
      await call(
        'PATCH',
        '/users/me/privacy',
        { profileVisibility: 'private' },
        bob,
      );
      expect((await compare(p, [a, b])).statusCode).toBe(404);
      await call(
        'PATCH',
        '/users/me/privacy',
        { profileVisibility: 'public' },
        bob,
      );
      await call('PATCH', `/rides/${b}`, { visibility: 'private' }, bob);
      expect((await compare(p, [a, b])).statusCode).toBe(404);
      await pool.query(
        "UPDATE routes SET verification='suggested' WHERE id=$1",
        [p.id],
      );
      expect(
        (
          await call('POST', `/circuits/${p.id}/compare-laps`, {
            activityIds: [a, b],
            lapNumbers: [1, 1],
          })
        ).statusCode,
      ).toBe(422);
    });
    it('voltas ausentes/inconclusivas, circuito diferente e Modo Passeio são rejeitados', async () => {
      const p = await route(true),
        a = await save(p, alice, { mode: 'pista' }),
        b = await save(p, alice, { mode: 'pista' });
      expect(
        (
          await call('POST', `/circuits/${p.id}/compare-laps`, {
            activityIds: [a, b],
            lapNumbers: [999, 1],
          })
        ).statusCode,
      ).toBe(400);
      await pool.query(
        `UPDATE ride_laps SET quality='{"accuracy":50,"method":"gps-line-intersection-v1"}' WHERE ride_id=$1`,
        [b],
      );
      expect(
        (
          await call('POST', `/circuits/${p.id}/compare-laps`, {
            activityIds: [a, b],
            lapNumbers: [1, 1],
          })
        ).statusCode,
      ).toBe(422);
    });
    it('agregação exige 10 participantes distintos; várias atividades de uma pessoa não contam', async () => {
      const p = await route(),
        a = await save(p),
        path = `/routes/${p.id}/comparison-stats?category=${encodeURIComponent('Não classificada')}&ccBand=2`;
      await call('PATCH', `/rides/${a}/comparison-privacy`, {
        enabled: true,
        technical: false,
      });
      for (let i = 0; i < 12; i++) {
        const b = await save(p);
        await call('PATCH', `/rides/${b}/comparison-privacy`, {
          enabled: true,
          technical: false,
        });
      }
      expect((await call('GET', path)).json().available).toBe(false);
      const participants: string[] = [];
      for (let i = 0; i < 9; i++) {
        const owner = randomUUID(),
          name = 'cohort_' + owner.replaceAll('-', '').slice(0, 16);
        participants.push(owner);
        await pool.query(
          `INSERT INTO users(id,display_name,username,email,password_hash,terms_version,privacy_version) SELECT $1,$2::text,$2::text,$2::text||'@example.com',password_hash,terms_version,privacy_version FROM users WHERE id=$3`,
          [owner, name, alice.id],
        );
        await pool.query('INSERT INTO privacy_settings(user_id) VALUES($1)', [
          owner,
        ]);
        await pool.query(
          `INSERT INTO rides(id,client_id,request_hash,owner_id,motorcycle_id,mode,visibility,started_at,ended_at,active_ms,paused_ms,distance_meters,average_kmh,maximum_kmh,active_intervals,motorcycle_snapshot,route_id,route_version,route_snapshot,route_result,comparison_enabled) SELECT $1,$2,request_hash,$3,motorcycle_id,mode,visibility,started_at,ended_at,active_ms,paused_ms,distance_meters,average_kmh,maximum_kmh,active_intervals,motorcycle_snapshot,route_id,route_version,route_snapshot,route_result,true FROM rides WHERE id=$4`,
          [randomUUID(), randomUUID(), owner, a],
        );
      }
      const r = await call('GET', path);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().available).toBe(true);
      expect(r.headers['cache-control']).toBe('private, no-store');
      expect(r.body).not.toMatch(
        /owner|latitude|longitude|timestamp|speed|samples/,
      );
      await pool.query(
        'UPDATE rides SET comparison_enabled=false WHERE owner_id=$1',
        [participants[0]],
      );
      expect((await call('GET', path)).json().available).toBe(false);
      expect((await call('GET', path + '&model=CB%20650R')).statusCode).toBe(
        400,
      );
      expect((await call('GET', path + '&ccBand=1')).statusCode).toBe(400);
    }, 20000);
  },
);
