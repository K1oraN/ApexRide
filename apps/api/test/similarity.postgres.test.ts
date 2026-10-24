import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { processBatch } from '../src/modules/similarity/worker.js';
import { CANDIDATES_SQL } from '../src/modules/similarity/repository.js';
import {
  importRegions,
  type RegionImport,
} from '../src/modules/similarity/regions.js';
import { readFile } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL,
  schema = 'similarity_test_' + randomUUID().replaceAll('-', '');
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
async function account(name: string) {
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
  );
  const s = {
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
async function save(
  s = alice,
  options: {
    partial?: boolean;
    reverse?: boolean;
    accuracy?: number;
    offset?: number;
  } = {},
) {
  const start = Date.now() - 300000,
    n = options.partial ? 61 : 201;
  const points = Array.from({ length: n }, (_, i) => ({
    longitude:
      -35.73 +
      ((options.reverse ? n - 1 - i : i) + (options.partial ? 40 : 0)) * 0.0001,
    latitude: -9.66 + (options.offset ?? 0),
    timestamp: start + i * 1000,
    accuracy: options.accuracy ?? 3,
    speed: 11,
    heading: null,
    altitude: null,
    segment: 0,
  }));
  const r = await call(
    'POST',
    '/rides',
    {
      clientId: randomUUID(),
      motorcycleId: s.bike,
      mode: 'misto',
      visibility: 'public',
      startedAt: start,
      endedAt: start + n * 1000,
      intervals: [{ start, end: start + n * 1000 }],
      points,
    },
    s,
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}
async function drain() {
  await processBatch(pool, 10);
}
describe.skipIf(!url)('15A–D PostGIS, fila, comparação e privacidade', () => {
  beforeAll(async () => {
    const config = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      DATABASE_SSL: process.env.DATABASE_SSL ?? 'disable',
    });
    const opts = {
      connectionString: config.databaseUrl,
      ssl:
        config.databaseSsl === 'verify-full'
          ? { rejectUnauthorized: true }
          : false,
    };
    admin = new pg.Pool(opts);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ ...opts, options: `-c search_path=${schema},public` });
    await migrate(pool);
    app = await buildApp({
      config,
      logger: false,
      database: { pool, check: async () => {}, close: async () => {} },
    });
    await app.ready();
    alice = await account('similar_alice');
    bob = await account('similar_bob');
  }, 20000);
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE rides,xp_ledger,user_progress,user_achievements,personal_challenges,gamification_jobs,leaderboard_scores,gamification_projection_cursor,gamification_audit CASCADE',
    );
    await pool.query('TRUNCATE similarity_backfill_cursor');
    await pool.query('TRUNCATE auth_rate_limits');
    await pool.query("UPDATE privacy_settings SET profile_visibility='public'");
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it('salva sem bloquear, indexa sem rota, encontra pares e reutiliza comparação', async () => {
    const a = await save(),
      b = await save();
    expect(
      (await call('GET', `/rides/${a}/similarity-status`)).json().status,
    ).toBe('queued');
    await drain();
    const list = await call('GET', `/rides/${a}/similar`);
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().matches).toHaveLength(1);
    expect(list.json().matches[0].classification).toBe('full');
    const result = await call('POST', `/rides/${a}/similar/compare`, {
      activityId: b,
    });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().referenceSource).toBe('gps-common');
    expect(result.json().commonMeters).toBeGreaterThan(2100);
    expect(result.json().activities[0].summary.commonActiveMs).toBeCloseTo(
      200000,
      -1,
    );
    expect(
      (await call('GET', '/rides/similar-groups')).json().groups[0],
    ).toHaveLength(2);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM ride_similarity_matches',
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('trecho parcial usa janelas comuns sem sensores inventados nem diferenças de totais', async () => {
    const a = await save(),
      b = await save(alice, { partial: true });
    await drain();
    const r = await call('POST', `/rides/${a}/similar/compare`, {
      activityId: b,
    });
    expect(r.statusCode, r.body).toBe(200);
    const data = r.json();
    expect(data.state).toBe('partial');
    expect(data.commonMeters).toBeGreaterThan(640);
    expect(data.commonMeters).toBeLessThan(680);
    for (const item of data.activities) {
      expect(item.summary.commonActiveMs).toBeCloseTo(60000, -1);
      expect(item.summary.motion).toBeNull();
      expect(
        item.samples.every(
          (s: { force: null; lean: null }) =>
            s.force === null && s.lean === null,
        ),
      ).toBe(true);
    }
    expect(
      data.differences.every(
        (d: { distanceMeters: null }) => d.distanceMeters === null,
      ),
    ).toBe(true);
  });
  it('sentido contrário fica relacionado e comparação orientada é recusada', async () => {
    const a = await save(),
      b = await save(alice, { reverse: true });
    await drain();
    expect(
      (await call('GET', `/rides/${a}/similar`)).json().matches[0]
        .classification,
    ).toBe('opposite');
    expect(
      (await call('POST', `/rides/${a}/similar/compare`, { activityId: b }))
        .statusCode,
    ).toBe(422);
  });
  it('nega IDs de terceiros, enumeração, precisão espacial e consultas sem autenticação', async () => {
    const a = await save(),
      b = await save(bob);
    await drain();
    for (const suffix of ['similar', 'similarity-status'])
      expect((await call('GET', `/rides/${b}/${suffix}`)).statusCode).toBe(404);
    expect(
      (await call('GET', `/rides/${a}/similar`, undefined, null)).statusCode,
    ).toBe(401);
    expect(
      (await call('GET', `/rides/${a}/similar?latitude=-9.66`)).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/rides/${a}/similar/compare`, { activityId: b }))
        .statusCode,
    ).toBe(404);
    expect(
      (await pool.query('SELECT * FROM ride_similarity_matches')).rows,
    ).toHaveLength(0);
  });
  it('participação explícita sem rota, revogação, perfil privado e exclusão', async () => {
    const a = await save(),
      b = await save(bob);
    for (const [id, s] of [
      [a, alice],
      [b, bob],
    ] as const)
      expect(
        (
          await call(
            'PATCH',
            `/rides/${id}/comparison-privacy`,
            { enabled: true, technical: false },
            s,
          )
        ).statusCode,
      ).toBe(200);
    await drain();
    expect(
      (await pool.query('SELECT * FROM ride_similarity_matches')).rows,
    ).toHaveLength(1);
    expect(
      (await call('GET', `/rides/${a}/similar`)).json().matches,
    ).toHaveLength(0);
    await call(
      'PATCH',
      `/rides/${b}/comparison-privacy`,
      { enabled: false, technical: false },
      bob,
    );
    expect(
      (await pool.query('SELECT * FROM ride_similarity_matches')).rows,
    ).toHaveLength(0);
    await pool.query(
      "UPDATE privacy_settings SET profile_visibility='private' WHERE user_id=$1",
      [bob.id],
    );
    await drain();
    expect(
      (await pool.query('SELECT * FROM ride_similarity_matches')).rows,
    ).toHaveLength(0);
    expect((await call('DELETE', `/rides/${a}`)).statusCode).toBe(200);
    expect(
      (
        await pool.query(
          'SELECT * FROM ride_similarity_index WHERE ride_id=$1',
          [a],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('dados imprecisos inelegíveis, backfill retomável e reprocessamento limitado', async () => {
    const a = await save(alice, { accuracy: 40 });
    await pool.query('DELETE FROM ride_similarity_index WHERE ride_id=$1', [a]);
    await drain();
    expect(
      (await call('GET', `/rides/${a}/similarity-status`)).json().status,
    ).toBe('insufficient');
    expect(
      (await call('POST', `/rides/${a}/similarity/reprocess`, {})).statusCode,
    ).toBe(409);
    await drain();
    expect(
      (await pool.query('SELECT * FROM ride_similarity_index')).rows,
    ).toHaveLength(1);
  });
  it('filtros de cilindrada, categoria e região não são ignorados', async () => {
    const a = await save();
    await save();
    await drain();
    expect(
      (await call('GET', `/rides/${a}/similar?ccBand=0`)).json().matches,
    ).toHaveLength(0);
    expect(
      (
        await call(
          'GET',
          `/rides/${a}/similar?ccBand=2&category=${encodeURIComponent('Não classificada')}`,
        )
      ).json().matches,
    ).toHaveLength(1);
    expect(
      (await call('GET', `/rides/${a}/similar?state=AL`)).json().matches,
    ).toHaveLength(0);
  });
  it('PostGIS usa GiST na pré-seleção e limita candidatos', async () => {
    const a = await save();
    await save();
    await drain();
    await pool.query('SET enable_seqscan=off');
    const plan = await pool.query('EXPLAIN (FORMAT JSON) ' + CANDIDATES_SQL, [
      a,
      'similarity-1',
      41,
    ]);
    await pool.query('RESET enable_seqscan');
    expect(JSON.stringify(plan.rows)).toContain('ride_similarity_spatial');
    expect(
      (await call('GET', `/rides/${a}/similarity-status`)).json()
        .candidateCount,
    ).toBeLessThanOrEqual(40);
  });
  it('comunidade rejeita recortes que identificam usuários e suprime grupos pequenos', async () => {
    expect(
      (
        await call(
          'GET',
          '/similarity/community?regionId=test&ccBand=2&category=Naked&brand=Honda',
        )
      ).statusCode,
    ).toBe(400);
    const r = await call(
      'GET',
      `/similarity/community?regionId=test&ccBand=2&category=${encodeURIComponent('Não classificada')}`,
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().available).toBe(false);
    expect(r.body).not.toContain('coordinates');
    expect(r.headers['cache-control']).toBe('private, no-store');
  });
  it('dez participantes distintos liberam somente agregado regional e revogação o suprime', async () => {
    await pool.query(
      `INSERT INTO similarity_regions(id,city,state,boundary,source_url) VALUES('synthetic','Cidade sintética','AL',public.ST_Multi(public.ST_MakeEnvelope(-36,-10,-35,-9,4326)),'https://example.com/test-only') ON CONFLICT DO NOTHING`,
    );
    const anchor = await save();
    await pool.query('UPDATE rides SET comparison_enabled=true WHERE id=$1', [
      anchor,
    ]);
    const owners: string[] = [],
      ids: string[] = [anchor];
    for (let i = 0; i < 9; i++) {
      const owner = randomUUID(),
        bike = randomUUID(),
        id = randomUUID(),
        name = 'cohort_' + randomUUID().replaceAll('-', '').slice(0, 12);
      owners.push(owner);
      ids.push(id);
      await pool.query(
        `INSERT INTO users(id,display_name,username,email,password_hash,terms_version,privacy_version) VALUES($1,$2,$2,$3,'test-only','test','test')`,
        [owner, name, name + '@example.com'],
      );
      await pool.query('INSERT INTO privacy_settings(user_id) VALUES($1)', [
        owner,
      ]);
      await pool.query(
        `INSERT INTO motorcycles(id,owner_id,brand,model,year,displacement_cc) VALUES($1,$2,'Honda','CB 650R',2024,649)`,
        [bike, owner],
      );
      await pool.query(
        `INSERT INTO rides SELECT (jsonb_populate_record(NULL::rides,to_jsonb(r)||jsonb_build_object('id',$2::text,'client_id',$3::text,'owner_id',$4::text,'motorcycle_id',$5::text))).* FROM rides r WHERE id=$1`,
        [anchor, id, randomUUID(), owner, bike],
      );
      await pool.query(
        `INSERT INTO ride_points(ride_id,point_order,position,recorded_at,accuracy,speed,heading,altitude,segment) SELECT $2,point_order,position,recorded_at,accuracy,speed,heading,altitude,segment FROM ride_points WHERE ride_id=$1`,
        [anchor, id],
      );
    }
    await drain();
    const path = `/similarity/community?regionId=synthetic&ccBand=2&category=${encodeURIComponent('Não classificada')}`;
    const r = await call('GET', path);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().available).toBe(true);
    for (const forbidden of [
      'coordinates',
      'timestamp',
      'owner_id',
      ...ids,
      ...owners,
    ])
      expect(r.body).not.toContain(forbidden);
    await pool.query('UPDATE rides SET comparison_enabled=false WHERE id=$1', [
      ids[1],
    ]);
    expect((await call('GET', path)).json().available).toBe(false);
    await pool.query('UPDATE rides SET comparison_enabled=true WHERE id=$1', [
      ids[1],
    ]);
    await drain();
    await pool.query(
      "UPDATE privacy_settings SET profile_visibility='private' WHERE user_id=$1",
      [owners[0]],
    );
    expect((await call('GET', path)).json().available).toBe(false);
  });
  it('candidatos permanecem limitados com 200, 1000 e 5000 sessões indexadas', async () => {
    const anchor = await save();
    await drain();
    for (const count of [200, 800, 4000]) {
      await pool.query(
        `INSERT INTO rides SELECT (jsonb_populate_record(NULL::rides,to_jsonb(r)||jsonb_build_object('id',gen_random_uuid(),'client_id',gen_random_uuid()))).* FROM rides r CROSS JOIN generate_series(1,$2::int) WHERE r.id=$1`,
        [anchor, count],
      );
      await pool.query(
        `UPDATE ride_similarity_index s SET geometry=public.ST_Translate((SELECT geometry::public.geometry FROM ride_similarity_index WHERE ride_id=$1),1+(abs(hashtext(s.ride_id::text)::bigint)%1000)/1000.0,0)::public.geography,status='done' WHERE s.ride_id<>$1 AND s.geometry IS NULL`,
        [anchor],
      );
      await pool.query('ANALYZE ride_similarity_index');
      const start = performance.now();
      const rows = await pool.query(CANDIDATES_SQL, [
        anchor,
        'similarity-1',
        41,
      ]);
      expect(rows.rows).toHaveLength(0);
      expect(performance.now() - start).toBeLessThan(1000);
    }
    const plan = await pool.query(
      'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + CANDIDATES_SQL,
      [anchor, 'similarity-1', 41],
    );
    expect(JSON.stringify(plan.rows)).toContain('ride_similarity_spatial');
  }, 30000);
  it('importa 102 municípios reais de Alagoas com fonte IBGE e atribui região pelo trajeto', async () => {
    await pool.query('TRUNCATE similarity_regions CASCADE');
    const snapshot = JSON.parse(
      await readFile(
        new URL(
          '../../../database/reference/alagoas-regions.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as RegionImport;
    expect(await importRegions(pool, snapshot)).toBe(102);
    expect(
      (await call('GET', '/similarity/regions'))
        .json()
        .regions.some(
          (r: { city: string; state: string }) =>
            r.city === 'Maceió' && r.state === 'AL',
        ),
    ).toBe(true);
    const ids = [await save(), await save()];
    await drain();
    const region = (
      await pool.query(
        'SELECT region_id FROM ride_similarity_index WHERE ride_id=$1',
        [ids[0]],
      )
    ).rows[0].region_id;
    expect(region).toBe('2704302');
    expect(
      (await call('GET', `/rides/${ids[0]}/similar?state=AL`)).json().matches,
    ).toHaveLength(1);
    await expect(
      importRegions(pool, {
        ...snapshot,
        sourceUrl: 'https://example.com/unverified',
      }),
    ).rejects.toThrow();
  });
  it('grupos se atualizam após reprocessamento e exclusão; lease vencido retoma sem duplicar', async () => {
    const a = await save(),
      b = await save(),
      c = await save();
    await drain();
    expect(
      (await call('GET', '/rides/similar-groups')).json().groups[0],
    ).toHaveLength(3);
    await pool.query(
      "UPDATE ride_similarity_index SET indexed_at=now()-interval '2 minutes' WHERE ride_id=$1",
      [a],
    );
    expect(
      (await call('POST', `/rides/${a}/similarity/reprocess`, {})).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/rides/similar-groups')).json().groups[0],
    ).toHaveLength(2);
    await pool.query(
      "UPDATE ride_similarity_index SET status='processing',lease_until=now()-interval '1 second' WHERE ride_id=$1",
      [a],
    );
    await Promise.all([processBatch(pool, 2), processBatch(pool, 2)]);
    expect(
      (await call('GET', '/rides/similar-groups')).json().groups[0],
    ).toHaveLength(3);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM ride_similarity_matches',
        )
      ).rows[0].n,
    ).toBe(3);
    await call('DELETE', `/rides/${b}`);
    await call('DELETE', `/rides/${c}`);
    expect(
      (await call('GET', '/rides/similar-groups')).json().groups,
    ).toHaveLength(0);
  });
});
