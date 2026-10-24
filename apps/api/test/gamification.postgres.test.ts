import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RidePayload } from '@apex-ride/ride-core';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { digest, csrfFor } from '../src/modules/auth/security.js';
import { persistRide } from '../src/modules/rides/persist.js';
import {
  processJobs,
  reconcileUser,
} from '../src/modules/gamification/engine.js';
import { transaction } from '../src/modules/groups/store.js';
import { decideRide } from '../src/modules/gamification/integrity.js';
import { circuitFixture, lapPoints } from './route-fixtures.js';
import { lineLength, type RoutePlan } from '@apex-ride/ride-core/routes';
const url = process.env.TEST_DATABASE_URL,
  schema = `gamification_${randomUUID().replaceAll('-', '')}`;
let admin: pg.Pool,
  pool: pg.Pool,
  app: FastifyInstance,
  alice: Session,
  bob: Session,
  bike: string;
type Session = { id: string; cookie: string; csrf: string };
async function account(name: string): Promise<Session> {
  const id = randomUUID(),
    raw = randomBytes(32).toString('base64url');
  await pool.query(
    "INSERT INTO users(id,display_name,username,email,password_hash,terms_version,privacy_version) VALUES($1,$2,$2,$3,'test','test','test')",
    [id, name, `${name}@example.com`],
  );
  await pool.query('INSERT INTO profiles(id,user_id) VALUES($1,$2)', [
    randomUUID(),
    id,
  ]);
  await pool.query('INSERT INTO privacy_settings(user_id) VALUES($1)', [id]);
  await pool.query(
    "INSERT INTO user_sessions(id,user_id,secret_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
    [randomUUID(), id, digest(raw)],
  );
  return { id, cookie: `apex_session=${raw}`, csrf: csrfFor(raw) };
}
function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  s = alice,
) {
  return app.inject({
    method,
    url: `/api${path}`,
    headers: {
      cookie: s.cookie,
      'x-apex-request': '1',
      'x-csrf-token': s.csrf,
    },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}
function activity(offset = 0, extra: Partial<RidePayload> = {}): RidePayload {
  const start = Date.now() - 600000 + offset;
  return {
    clientId: randomUUID(),
    motorcycleId: bike,
    mode: 'passeio',
    visibility: 'private',
    startedAt: start,
    endedAt: start + 120000,
    intervals: [{ start, end: start + 120000 }],
    points: Array.from({ length: 61 }, (_, i) => ({
      latitude: -9.665,
      longitude: -35.735 + i * 0.00003,
      timestamp: start + i * 2000,
      accuracy: 8,
      speed: 2,
      heading: 90,
      altitude: null,
      segment: 0,
    })),
    ...extra,
  };
}
async function xp(s = alice) {
  const r = await call('GET', '/gamification/me', undefined, s);
  expect(r.statusCode, r.body).toBe(200);
  return r.json().progress;
}
async function reconcile() {
  await transaction(pool, [alice.id], (c) => reconcileUser(c, alice.id));
}
const preferences = (extra: object = {}) => ({
  optedIn: true,
  showProgress: false,
  showAchievements: false,
  circuitOptIn: false,
  state: '',
  city: '',
  consentVersion: 'gamification-v1',
  ...extra,
});
async function approvedPlan(
  b: RidePayload,
  circuit = false,
): Promise<RoutePlan> {
  const id = randomUUID(),
    fixture = circuitFixture(),
    first = b.points[0]!,
    last = b.points.at(-1)!;
  const geometry = circuit
    ? fixture.geometry
    : {
        type: 'LineString' as const,
        coordinates: [
          [first.longitude, first.latitude],
          [last.longitude, last.latitude],
        ] as [number, number][],
      };
  const plan: RoutePlan = {
    id,
    version: 1,
    name: 'Trajeto sintético aprovado',
    kind: circuit ? 'circuit' : 'route',
    geometry,
    distanceMeters: lineLength(geometry),
    verification: circuit ? 'verified' : 'suggested',
    startLine: circuit ? fixture.startLine : null,
    direction: circuit ? 1 : null,
  };
  await pool.query(
    `INSERT INTO routes(id,owner_id,kind,name,city,state,geometry,distance_meters,source,status,verification,start_line,direction) VALUES($1,$2,$3,$4,'Maceió','AL',public.ST_SetSRID(public.ST_GeomFromGeoJSON($5),4326),$6,'manual','approved',$7,public.ST_SetSRID(public.ST_GeomFromGeoJSON($8::text),4326),$9)`,
    [
      id,
      alice.id,
      plan.kind,
      plan.name,
      JSON.stringify(geometry),
      plan.distanceMeters,
      plan.verification,
      plan.startLine ? JSON.stringify(plan.startLine) : null,
      plan.direction,
    ],
  );
  await pool.query(
    `INSERT INTO route_versions(route_id,version,plan,verified_at) VALUES($1,1,$2,$3)`,
    [id, JSON.stringify(plan), circuit ? new Date(b.startedAt - 10000) : null],
  );
  return plan;
}
async function pastEvent() {
  const event = randomUUID();
  await pool.query(
    `INSERT INTO social_events(id,organizer_id,creation_key,title,event_type,visibility,status,join_policy,city,state,meeting_point,meeting_point_label,starts_at,ends_at,timezone) VALUES($1,$2,$3,'Encontro sintético','meetup','invite','finished','immediate','Maceió','AL',public.ST_SetSRID(public.ST_MakePoint(-35.7,-9.6),4326),'Local privado',now()-interval '2 hours',now()-interval '1 hour','America/Maceio')`,
    [event, bob.id, randomUUID()],
  );
  await pool.query(
    `INSERT INTO event_participants(event_id,user_id,participation_status,joined_at) VALUES($1,$2,'confirmed',now()-interval '2 hours'),($1,$3,'confirmed',now()-interval '2 hours')`,
    [event, alice.id, bob.id],
  );
  return event;
}
describe.skipIf(!url)('21A–21D PostgreSQL transacional', () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({
      connectionString: url,
      options: `-c search_path=${schema},public`,
    });
    await migrate(pool);
    app = await buildApp({
      config: parseEnv({ NODE_ENV: 'test', DATABASE_URL: url! }),
      database: { pool, check: async () => {}, close: async () => {} },
      logger: false,
    });
  }, 30000);
  beforeEach(async () => {
    await pool.query(
      'ALTER TABLE admin_audit_logs DISABLE TRIGGER admin_audit_no_truncate',
    );
    await pool.query('TRUNCATE users CASCADE');
    await pool.query(
      'ALTER TABLE admin_audit_logs ENABLE TRIGGER admin_audit_no_truncate',
    );
    await pool.query('DELETE FROM xp_rules WHERE version>1');
    await pool.query('UPDATE xp_rules SET enabled=true');
    await pool.query('UPDATE achievement_definitions SET enabled=true');
    await pool.query('TRUNCATE leaderboard_seasons CASCADE');
    alice = await account('gam_alice');
    bob = await account('gam_bob');
    bike = randomUUID();
    await pool.query(
      "INSERT INTO motorcycles(id,owner_id,brand,model,year,displacement_cc) VALUES($1,$2,'Honda','CB 300',2024,300)",
      [bike, alice.id],
    );
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  });
  it('21A GPS privado sem sensores gera 120 XP, nível 2 e trilha versionada', async () => {
    const r = await persistRide(pool, alice.id, activity());
    expect(await xp()).toMatchObject({
      totalXp: 120,
      level: 2,
      validRides: 1,
      pending: false,
    });
    const h = await call('GET', '/gamification/me/xp-history');
    expect(h.json().items).toHaveLength(2);
    expect(JSON.stringify(h.json())).not.toMatch(
      /longitude|latitude|coordinates/,
    );
    expect(
      (await call('GET', `/gamification/me/rides/${r.id}`)).json().xp,
    ).toBe(120);
  });
  it('21A dez envios simultâneos e retentativa não duplicam', async () => {
    const b = activity();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => persistRide(pool, alice.id, b)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await xp()).toMatchObject({ totalXp: 120, validRides: 1 });
    await processJobs(pool);
    await reconcile();
    expect((await xp()).totalXp).toBe(120);
  });
  it('21A IDs diferentes em envios concorrentes sobrepostos não duplicam a participação', async () => {
    const b = activity();
    await Promise.all(
      Array.from({ length: 4 }, () =>
        persistRide(pool, alice.id, { ...b, clientId: randomUUID() }),
      ),
    );
    expect((await xp()).totalXp).toBe(120);
    await reconcile();
    expect((await xp()).totalXp).toBe(120);
  });
  it('21A insuficiência não recebe XP e nunca altera telemetria', async () => {
    const b = activity();
    b.points = b.points.slice(0, 3);
    const saved = await persistRide(pool, alice.id, b);
    expect((await xp()).totalXp).toBe(0);
    expect(
      (await call('GET', `/gamification/me/rides/${saved.id}`)).json().fact
        .state,
    ).toBe('ineligible');
  });
  it('21A GPS impreciso fica pendente sem punição', async () => {
    const b = activity();
    b.points.forEach((p) => (p.accuracy = 40));
    const saved = await persistRide(pool, alice.id, b);
    expect((await xp()).totalXp).toBe(0);
    expect(
      (await call('GET', `/gamification/me/rides/${saved.id}`)).json().fact
        .state,
    ).toBe('pending');
    expect(
      (await pool.query('SELECT * FROM gamification_reviews')).rowCount,
    ).toBe(1);
  });
  it('21A atividade duplicada com novo ID fica pendente por sobreposição', async () => {
    const b = activity();
    await persistRide(pool, alice.id, b);
    await persistRide(pool, alice.id, { ...b, clientId: randomUUID() });
    expect((await xp()).totalXp).toBe(120);
  });
  it('21A limite diário permite três concessões de atividade e muda no dia seguinte', async () => {
    for (let i = 0; i < 4; i++)
      await persistRide(pool, alice.id, activity(-i * 180000));
    expect((await xp()).totalXp).toBe(160);
    await pool.query(
      "UPDATE rides SET created_at=created_at-interval '1 day',ended_at=ended_at-interval '1 day',started_at=started_at-interval '1 day' WHERE owner_id=$1",
      [alice.id],
    );
    const next = activity();
    await persistRide(pool, alice.id, next);
    expect((await xp()).totalXp).toBe(180);
  });
  it('21A privacidade preserva XP; exclusão compensa e bloqueia reenvio', async () => {
    const b = activity(),
      r = await persistRide(pool, alice.id, b);
    expect(
      (await call('PATCH', `/rides/${r.id}`, { visibility: 'public' }))
        .statusCode,
    ).toBe(200);
    await reconcile();
    expect((await xp()).totalXp).toBe(120);
    expect((await call('DELETE', `/rides/${r.id}`)).statusCode).toBe(200);
    expect((await xp()).totalXp).toBe(0);
    expect(
      (await pool.query("SELECT * FROM xp_ledger WHERE status='reversal'"))
        .rowCount,
    ).toBe(2);
    await expect(persistRide(pool, alice.id, b)).rejects.toMatchObject({
      statusCode: 410,
    });
    await reconcile();
    expect((await xp()).totalXp).toBe(0);
  });
  it('21A exclusão por clientId também compensa', async () => {
    const b = activity();
    await persistRide(pool, alice.id, b);
    expect(
      (await call('DELETE', `/rides/by-client/${b.clientId}`)).statusCode,
    ).toBe(200);
    expect((await xp()).totalXp).toBe(0);
  });
  it('21A livro imutável e rollback impedem saldo parcial', async () => {
    await persistRide(pool, alice.id, activity());
    await expect(
      pool.query('UPDATE xp_ledger SET xp_delta=999'),
    ).rejects.toThrow('append only');
    await expect(
      transaction(pool, [alice.id], async (c) => {
        await reconcileUser(c, alice.id);
        throw Error('interrupção');
      }),
    ).rejects.toThrow('interrupção');
    expect((await xp()).totalXp).toBe(120);
  });
  it('21A nova versão não duplica fatos já concedidos', async () => {
    await persistRide(pool, alice.id, activity());
    await pool.query(
      "INSERT INTO xp_rules VALUES('ride',2,'Regra revisada',25,3,true)",
    );
    await reconcile();
    expect((await xp()).totalXp).toBe(120);
    await persistRide(pool, alice.id, activity(-180000));
    expect((await xp()).totalXp).toBe(145);
    await pool.query(
      "UPDATE xp_rules SET enabled=false WHERE code='ride' AND version=2",
    );
    await reconcile();
    expect((await xp()).totalXp).toBe(100);
  });
  it('21B conquistas reais, garagem única e progresso parcial', async () => {
    await processJobs(pool);
    let a = (await call('GET', '/gamification/me/achievements')).json().items;
    expect(
      a.find((a: { code: string }) => a.code === 'first_bike').status,
    ).toBe('unlocked');
    expect((await xp()).totalXp).toBe(0);
    await persistRide(pool, alice.id, activity());
    a = (await call('GET', '/gamification/me/achievements')).json().items;
    expect(
      a.find((a: { code: string }) => a.code === 'five_rides'),
    ).toMatchObject({ status: 'locked', current_value: 1, target: 5 });
  });
  it('21B metas opcionais aceitam cancelar sem penalidade', async () => {
    expect(
      (
        await call('POST', '/gamification/me/challenges', {
          code: 'first_ride',
        })
      ).statusCode,
    ).toBe(200);
    await persistRide(pool, alice.id, activity());
    expect(
      (await call('GET', '/gamification/me/challenges')).json().items[0].status,
    ).toBe('completed');
    await call('DELETE', '/gamification/me/challenges/first_ride');
    expect((await xp()).totalXp).toBe(120);
    expect(
      (await call('POST', '/gamification/me/challenges', { code: 'speed' }))
        .statusCode,
    ).toBe(400);
  });
  it('21C opt-in desligado, ativação, privacidade e saída imediata', async () => {
    await persistRide(pool, alice.id, activity());
    expect(
      (await call('GET', '/gamification/leaderboards/xp')).json().items,
    ).toHaveLength(0);
    expect(
      (
        await call(
          'PATCH',
          '/gamification/me/ranking-preferences',
          preferences(),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/gamification/leaderboards/xp')).json().items[0],
    ).toMatchObject({ user_id: alice.id, score: 120, position: 1 });
    await pool.query(
      "UPDATE privacy_settings SET profile_visibility='private' WHERE user_id=$1",
      [alice.id],
    );
    expect(
      (await call('GET', '/gamification/leaderboards/xp')).json().items,
    ).toHaveLength(0);
    await pool.query(
      "UPDATE privacy_settings SET profile_visibility='public' WHERE user_id=$1",
      [alice.id],
    );
    await call(
      'PATCH',
      '/gamification/me/ranking-preferences',
      preferences({ optedIn: false }),
    );
    expect(
      (await call('GET', '/gamification/leaderboards/xp')).json().items,
    ).toHaveLength(0);
    expect((await xp()).totalXp).toBe(120);
  });
  it('21C região escolhida, mínimo de cinco e restrição de troca', async () => {
    await persistRide(pool, alice.id, activity());
    await call(
      'PATCH',
      '/gamification/me/ranking-preferences',
      preferences({ state: 'AL', city: 'Maceió' }),
    );
    expect(
      (await call('GET', '/gamification/leaderboards/xp?state=AL')).json()
        .unavailable,
    ).toMatch(/cinco/);
    expect(
      (
        await call(
          'PATCH',
          '/gamification/me/ranking-preferences',
          preferences({ state: 'SP' }),
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'PATCH',
          '/gamification/me/ranking-preferences',
          preferences({ optedIn: false, state: 'AL', city: 'Maceió' }),
        )
      ).statusCode,
    ).toBe(200);
  });
  it('21C temporadas usam recebimento do servidor; histórico não reinicia', async () => {
    await persistRide(pool, alice.id, activity(-40 * 86400000));
    const ledger = (
      await pool.query("SELECT season_id FROM xp_ledger WHERE status='granted'")
    ).rows;
    expect(ledger.every((l) => l.season_id)).toBe(true);
    await pool.query(
      "UPDATE leaderboard_seasons SET status='closed',closed_at=now() WHERE status='active'",
    );
    expect((await xp()).totalXp).toBe(120);
    await reconcile();
    expect((await xp()).totalXp).toBe(120);
  });
  it('21C backfill anterior à ativação concede apenas XP pessoal e retoma lotes', async () => {
    const b = activity(-101 * 86400000);
    const r = await persistRide(pool, alice.id, b);
    await pool.query(
      "UPDATE rides SET created_at=created_at-interval '100 days',updated_at=now() WHERE id=$1",
      [r.id],
    );
    await pool.query(
      'TRUNCATE xp_ledger,user_progress,gamification_ride_facts,leaderboard_scores,gamification_projection_cursor CASCADE',
    );
    await reconcile();
    expect((await xp()).totalXp).toBe(120);
    expect(
      (await pool.query('SELECT season_id FROM xp_ledger')).rows.every(
        (r) => r.season_id === null,
      ),
    ).toBe(true);
    await reconcile();
    expect((await xp()).totalXp).toBe(120);
  });
  it('21D cliente não concede XP, nível, score ou conquistas; isolamento e CSRF', async () => {
    for (const b of [
      { xp: 999 },
      { level: 50 },
      { achievementUnlocked: true },
      { score: 99 },
      { isAdmin: true },
      { seasonOverride: 'x' },
    ])
      expect(
        (
          await call('PATCH', '/gamification/me/ranking-preferences', {
            ...preferences(),
            ...b,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (await call('POST', '/gamification/me', { xp: 999 })).statusCode,
    ).toBe(404);
    const r = await persistRide(pool, alice.id, activity());
    expect(
      (await call('GET', `/gamification/me/rides/${r.id}`, undefined, bob))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/gamification/me/ranking-preferences',
          headers: { cookie: alice.cookie, 'x-apex-request': '1' },
          payload: preferences(),
        })
      ).statusCode,
    ).toBe(403);
    expect((await xp(bob)).totalXp).toBe(0);
  });
  it('21D contestação exige origem própria e é idempotente', async () => {
    const r = await persistRide(pool, alice.id, activity());
    expect(
      (
        await call(
          'POST',
          '/gamification/me/reviews',
          { rideId: r.id, reason: 'Solicito revisão' },
          bob,
        )
      ).statusCode,
    ).toBe(404);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await call('POST', '/gamification/me/reviews', {
            rideId: r.id,
            reason: 'Solicito revisão',
          })
        ).statusCode,
      ).toBe(200);
    expect(
      (await pool.query('SELECT * FROM gamification_reviews')).rowCount,
    ).toBe(1);
  });
  it('21D aplica limite compartilhado sem aceitar campos de confiança', async () => {
    await pool.query(
      `INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,180,now()+interval '1 minute')`,
      [digest(`gamification:${alice.id}:read`)],
    );
    const r = await call('GET', '/gamification/me');
    expect(r.statusCode).toBe(429);
    expect(r.headers['retry-after']).toBe('60');
  });
  it('21B definição desabilitada fica indisponível e não pode ser compartilhada', async () => {
    await persistRide(pool, alice.id, activity());
    await pool.query(
      "UPDATE achievement_definitions SET enabled=false WHERE code='first_ride'",
    );
    const a = (await call('GET', '/gamification/me/achievements'))
      .json()
      .items.find((a: { code: string }) => a.code === 'first_ride');
    expect(a.status).toBe('unavailable');
    expect(
      (
        await call('POST', '/social/posts', {
          text: 'Teste',
          visibility: 'public',
          achievementCode: 'first_ride',
        })
      ).statusCode,
    ).toBe(400);
    expect((await xp()).totalXp).toBe(120);
  });
  it('21B rota concluída no servidor, repetida e geometria duplicada não duplicam exploração', async () => {
    const b = activity(),
      plan = await approvedPlan(b);
    b.route = { plan, abandoned: false };
    await persistRide(pool, alice.id, b);
    expect((await xp()).totalXp).toBe(160);
    const other = activity(-180000);
    other.route = { plan, abandoned: false };
    await persistRide(pool, alice.id, other);
    expect((await xp()).totalXp).toBe(180);
    const duplicate = activity(-360000),
      sameGeometry = await approvedPlan(duplicate);
    duplicate.route = { plan: sameGeometry, abandoned: false };
    await persistRide(pool, alice.id, duplicate);
    expect((await xp()).totalXp).toBe(200);
    expect(
      Number(
        (
          await pool.query(
            'SELECT count(DISTINCT route_key) AS n FROM gamification_ride_facts WHERE user_id=$1',
            [alice.id],
          )
        ).rows[0].n,
      ),
    ).toBe(1);
  });
  it('21B três rotas desbloqueiam Novos Horizontes; arquivar uma reavalia o prêmio', async () => {
    let last = '';
    for (let i = 0; i < 3; i++) {
      const b = activity(-i * 180000);
      b.points.forEach((p) => (p.latitude += i * 0.01));
      const plan = await approvedPlan(b);
      b.route = { plan, abandoned: false };
      await persistRide(pool, alice.id, b);
      last = plan.id;
    }
    expect((await xp()).totalXp).toBe(300);
    const a = (await call('GET', '/gamification/me/achievements')).json().items;
    expect(
      a.find((a: { code: string }) => a.code === 'three_routes').status,
    ).toBe('unlocked');
    await pool.query("UPDATE routes SET status='archived' WHERE id=$1", [last]);
    await processJobs(pool);
    expect((await xp()).totalXp).toBe(225);
  });
  it('21B RSVP não pontua; organização verifica sem GPS, revoga e restaura com auditoria', async () => {
    const event = await pastEvent();
    await reconcile();
    expect((await xp()).totalXp).toBe(0);
    expect(
      (
        await call(
          'PATCH',
          `/events/${event}/attendance/${alice.id}`,
          { verified: true, reason: 'Presença observada' },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    for (const verified of [true, true, false, true]) {
      const r = await call(
        'PATCH',
        `/events/${event}/attendance/${alice.id}`,
        { verified, reason: 'Verificação presencial pós-evento' },
        bob,
      );
      expect(r.statusCode, r.body).toBe(200);
      expect((await xp()).totalXp).toBe(verified ? 70 : 0);
    }
    expect(
      (await pool.query('SELECT * FROM live_location_sessions')).rowCount,
    ).toBe(0);
    expect(
      (await pool.query('SELECT * FROM gamification_audit')).rowCount,
    ).toBe(4);
    await pool.query(
      "UPDATE social_events SET status='cancelled' WHERE id=$1",
      [event],
    );
    await processJobs(pool);
    expect((await xp()).totalXp).toBe(0);
  });
  it('21B rejeita presença falsa, antes do fim e por terceiro', async () => {
    const event = await pastEvent(),
      charlie = await account('gam_charlie');
    expect(
      (
        await call(
          'PATCH',
          `/events/${event}/attendance/${charlie.id}`,
          { verified: true, reason: 'Teste' },
          bob,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'PATCH',
          `/events/${event}/attendance/${alice.id}`,
          { verified: true, reason: 'Teste' },
          charlie,
        )
      ).statusCode,
    ).toBe(404);
    await pool.query(
      "UPDATE social_events SET ends_at=now()+interval '1 hour' WHERE id=$1",
      [event],
    );
    expect(
      (
        await call(
          'PATCH',
          `/events/${event}/attendance/${alice.id}`,
          { verified: true, reason: 'Teste' },
          bob,
        )
      ).statusCode,
    ).toBe(409);
  });
  it('21A fila preserva revisão concorrente de evento até reconciliar o cancelamento', async () => {
    const event = await pastEvent();
    expect(
      (
        await call(
          'PATCH',
          `/events/${event}/attendance/${alice.id}`,
          { verified: true, reason: 'Presença confirmada' },
          bob,
        )
      ).statusCode,
    ).toBe(200);
    await pool.query('INSERT INTO gamification_jobs(user_id) VALUES($1)', [
      alice.id,
    ]);
    await transaction(pool, [alice.id], async (c) => {
      const db = {
        query: (async (sql: string, values: unknown[]) => {
          const result = await c.query(sql, values);
          if (sql.startsWith('SELECT a.event_id'))
            await pool.query(
              "UPDATE social_events SET status='cancelled' WHERE id=$1",
              [event],
            );
          return result;
        }) as pg.PoolClient['query'],
      };
      expect((await reconcileUser(db, alice.id)).pending).toBe(true);
    });
    expect((await xp()).pending).toBe(true);
    await processJobs(pool);
    expect(await xp()).toMatchObject({ totalXp: 0, pending: false });
  });
  it('21B compartilhar exige conquista real e expõe apenas referência segura', async () => {
    expect(
      (
        await call('POST', '/social/posts', {
          text: 'Teste',
          visibility: 'public',
          achievementCode: 'first_ride',
        })
      ).statusCode,
    ).toBe(400);
    await persistRide(pool, alice.id, activity());
    const r = await call('POST', '/social/posts', {
      text: 'Conquistei primeiros passos',
      visibility: 'public',
      achievementCode: 'first_ride',
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().post.achievement).toEqual({
      code: 'first_ride',
      name: 'Primeiros passos',
    });
    expect(JSON.stringify(r.json().post.achievement)).not.toMatch(
      /source|coordinates|unlocked_at/,
    );
  });
  it('21C empate compartilha posição, filtros usam snapshot da moto e bloqueio remove entrada', async () => {
    await pool.query(
      "INSERT INTO motorcycle_model_categories(brand,model,category,source_url,verified_at) VALUES('Honda','CB 300','Naked','https://example.com/catalog',now())",
    );
    const b = activity();
    await persistRide(pool, alice.id, b);
    await call('PATCH', '/gamification/me/ranking-preferences', preferences());
    await pool.query('UPDATE motorcycles SET owner_id=$2 WHERE id=$1', [
      bike,
      bob.id,
    ]);
    await persistRide(pool, bob.id, { ...activity(), clientId: randomUUID() });
    await call(
      'PATCH',
      '/gamification/me/ranking-preferences',
      preferences(),
      bob,
    );
    const r = await call(
      'GET',
      '/gamification/leaderboards/xp?category=Naked&ccBand=up-to-300',
    );
    expect(r.json().items.map((x: { position: number }) => x.position)).toEqual(
      [1, 1],
    );
    await pool.query(
      "UPDATE motorcycles SET displacement_cc=900,brand='Outra' WHERE id=$1",
      [bike],
    );
    await reconcile();
    expect(
      (
        await call(
          'GET',
          '/gamification/leaderboards/xp?category=Naked&ccBand=up-to-300',
        )
      ).json().items,
    ).toHaveLength(1); // Bob está na fila; snapshot de Alice é preservado.
    await processJobs(pool);
    expect(
      (
        await call(
          'GET',
          '/gamification/leaderboards/xp?category=Naked&ccBand=up-to-300',
        )
      ).json().items,
    ).toHaveLength(2);
    await pool.query(
      'INSERT INTO social_blocks(blocker_id,blocked_id) VALUES($1,$2)',
      [alice.id, bob.id],
    );
    expect(
      (await call('GET', '/gamification/leaderboards/xp')).json().items,
    ).toHaveLength(1);
  });
  it('21C exposição de progresso é separada e sem detalhes de origem', async () => {
    await persistRide(pool, alice.id, activity());
    expect(
      (
        await call('GET', `/gamification/users/${alice.id}`, undefined, bob)
      ).json(),
    ).toEqual({ progress: null, achievements: [] });
    await call(
      'PATCH',
      '/gamification/me/ranking-preferences',
      preferences({ showProgress: true, showAchievements: true }),
    );
    const r = (
      await call('GET', `/gamification/users/${alice.id}`, undefined, bob)
    ).json();
    expect(r.progress).toEqual({ level: 2, totalXp: 120 });
    expect(JSON.stringify(r)).not.toMatch(
      /source|unlocked_at|updatedAt|validRides/,
    );
  });
  it('21D decisões internas compensam, auditam e não repetem compensação', async () => {
    const r = await persistRide(pool, alice.id, activity());
    await decideRide(
      pool,
      r.id,
      false,
      'operador-teste',
      'Sessão invalidada no ambiente sintético',
    );
    expect((await xp()).totalXp).toBe(0);
    await reconcile();
    expect((await xp()).totalXp).toBe(0);
    await decideRide(pool, r.id, true, 'operador-teste', 'Correção confirmada');
    expect((await xp()).totalXp).toBe(120);
    expect(
      (
        await pool.query(
          "SELECT * FROM xp_ledger WHERE status='reversal' AND actor='operador-teste'",
        )
      ).rowCount,
    ).toBe(2);
  });
  it('21D circuito verificado retorna somente voltas próprias estimadas, sem ranking oficial', async () => {
    const b = activity(),
      plan = await approvedPlan(b, true);
    b.mode = 'pista';
    b.points = lapPoints(b.startedAt);
    b.route = { plan, abandoned: false };
    await persistRide(pool, alice.id, b);
    const r = await call('GET', `/circuits/${plan.id}/leaderboard`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().items).toHaveLength(2);
    expect(r.json()).toMatchObject({
      official: false,
      experimentalAvailable: false,
      publicEntries: [],
    });
    expect(
      (
        await call('GET', `/circuits/${plan.id}/leaderboard`, undefined, bob)
      ).json().items,
    ).toHaveLength(0);
    const street = await approvedPlan(activity());
    expect(
      (await call('GET', `/circuits/${street.id}/leaderboard`)).statusCode,
    ).toBe(404);
  });
  it('21A backfill em lotes retoma sem perder ou duplicar concessões', async () => {
    await persistRide(pool, alice.id, activity());
    await persistRide(pool, alice.id, activity(-180000));
    await pool.query(
      'TRUNCATE xp_ledger,user_progress,gamification_ride_facts,leaderboard_scores,gamification_projection_cursor CASCADE',
    );
    for (let i = 0; i < 3; i++)
      await transaction(pool, [alice.id], (c) => reconcileUser(c, alice.id, 1));
    expect((await xp()).totalXp).toBe(140);
    await reconcile();
    expect((await xp()).totalXp).toBe(140);
  });
  it('21C mínimo regional, paginação estável e agenda mensal em fuso explícito', async () => {
    await persistRide(pool, alice.id, activity());
    const season = (
      await pool.query(
        "SELECT id,starts_at AT TIME ZONE 'America/Sao_Paulo' AS local_start FROM leaderboard_seasons WHERE status='active'",
      )
    ).rows[0];
    expect(new Date(season.local_start).getDate()).toBe(1);
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const s = await account(`participant_${i}`);
      ids.push(s.id);
      await pool.query(
        "INSERT INTO leaderboard_participation(user_id,opted_in,state,city) VALUES($1,true,'AL','Maceió')",
        [s.id],
      );
      await pool.query(
        "INSERT INTO leaderboard_scores(season_id,user_id,category,displacement_band,kind,score) VALUES($1,$2,'Naked','up-to-300','xp',20)",
        [season.id, s.id],
      );
    }
    const a = (
        await call('GET', '/gamification/leaderboards/xp?state=AL')
      ).json(),
      b = (
        await call('GET', '/gamification/leaderboards/xp?state=AL&page=2')
      ).json();
    expect(a.items).toHaveLength(20);
    expect(b.items).toHaveLength(5);
    expect(
      new Set(
        [...a.items, ...b.items].map((e: { user_id: string }) => e.user_id),
      ).size,
    ).toBe(25);
    expect(a.items.every((e: { position: number }) => e.position === 1)).toBe(
      true,
    );
    await pool.query(
      'UPDATE leaderboard_participation SET opted_in=false WHERE user_id=ANY($1::uuid[])',
      [ids.slice(4)],
    );
    expect(
      (await call('GET', '/gamification/leaderboards/xp?state=AL')).json()
        .items,
    ).toHaveLength(0);
    const future = (
      await pool.query(
        "SELECT id FROM leaderboard_seasons WHERE status='scheduled'",
      )
    ).rows[0].id;
    expect(
      (
        await call('GET', `/gamification/leaderboards/xp?season=${future}`)
      ).json().unavailable,
    ).toMatch(/iniciada/);
  }, 15000); // Prepara 25 contas e suas projeções em PostgreSQL real.
  it('21C correção de temporada fechada incrementa revisão sem apagar XP histórico silenciosamente', async () => {
    const r = await persistRide(pool, alice.id, activity());
    const season = (
      await pool.query(
        "SELECT id,revision FROM leaderboard_seasons WHERE status='active'",
      )
    ).rows[0];
    await pool.query(
      "UPDATE leaderboard_seasons SET status='closed' WHERE id=$1",
      [season.id],
    );
    await call('DELETE', `/rides/${r.id}`);
    expect(
      Number(
        (
          await pool.query(
            'SELECT revision FROM leaderboard_seasons WHERE id=$1',
            [season.id],
          )
        ).rows[0].revision,
      ),
    ).toBe(season.revision + 1);
    expect((await xp()).totalXp).toBe(0);
    await reconcile();
    expect(
      Number(
        (
          await pool.query(
            'SELECT revision FROM leaderboard_seasons WHERE id=$1',
            [season.id],
          )
        ).rows[0].revision,
      ),
    ).toBe(season.revision + 1);
  });
});
