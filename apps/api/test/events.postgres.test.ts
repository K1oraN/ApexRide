import { randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { persistRide } from '../src/modules/rides/persist.js';
import { cleanupSocialMedia } from '../src/modules/social/media.js';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { parseEnv } from '../src/config/env.js';
import { cleanupLive } from '../src/modules/events/live.js';
const url = process.env.TEST_DATABASE_URL,
  schema = `events_test_${randomUUID().replaceAll('-', '')}`;
let pool: pg.Pool, admin: pg.Pool, app: FastifyInstance;
type Session = { id: string; cookie: string; csrf: string };
let alice: Session, bob: Session, charlie: Session;
const files = new Map<string, Buffer>();
const storage = {
  put: async (k: string, b: Buffer) => {
    files.set(k, b);
  },
  get: async (k: string) => {
    if (!files.has(k)) throw Error('missing');
    return files.get(k)!;
  },
  remove: async (k: string) => {
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
  const reg = await call('POST', '/auth/register', {
    displayName: name,
    username: name,
    email: `${name}@example.com`,
    password: 'frase de senha longa e segura',
    acceptTerms: true,
    termsVersion: 'prelaunch-draft',
    privacyVersion: 'prelaunch-draft',
  });
  expect(reg.statusCode, reg.body).toBe(201);
  const r = await call('POST', '/auth/login', {
    email: `${name}@example.com`,
    password: 'frase de senha longa e segura',
  });
  expect(r.statusCode, r.body).toBe(200);
  return {
    id: r.json().user.id,
    cookie: String(r.headers['set-cookie']).split(';')[0]!,
    csrf: r.json().csrfToken,
  };
}
const body = (extra: Record<string, unknown> = {}) => ({
  creationKey: randomUUID(),
  title: 'Café dos motociclistas',
  description: 'Encontro de teste',
  rules: 'Respeite o local',
  eventType: 'meetup',
  visibility: 'public',
  joinPolicy: 'immediate',
  city: 'Maceió',
  state: 'AL',
  meetingPoint: [-35.7, -9.6],
  meetingPointLabel: 'Praça de teste',
  startsAt: new Date(Date.now() + 60000).toISOString(),
  endsAt: new Date(Date.now() + 7200000).toISOString(),
  timezone: 'America/Maceio',
  confirmPoint: true,
  ...extra,
});
async function event(extra: Record<string, unknown> = {}) {
  const r = await call('POST', '/events', body(extra), alice);
  expect(r.statusCode, r.body).toBe(201);
  return r.json().event;
}
async function ongoing(extra: Record<string, unknown> = {}) {
  const e = await event(extra);
  await pool.query(
    "UPDATE social_events SET starts_at=now()-interval '1 minute' WHERE id=$1",
    [e.id],
  );
  return e;
}
async function join(event: string, s = bob, status = 'confirmed') {
  return call('POST', `/events/${event}/rsvp`, { status }, s);
}
async function start(
  event: string,
  s = bob,
  extra: Record<string, unknown> = {},
) {
  return call(
    'POST',
    `/events/${event}/live-location/start`,
    {
      consent: true,
      consentVersion: 'live-v1',
      audience: 'confirmed',
      precision: 'precise',
      durationMinutes: 30,
      ...extra,
    },
    s,
  );
}
async function publish(
  event: string,
  session: string,
  s = bob,
  extra: Record<string, unknown> = {},
) {
  return call(
    'POST',
    `/events/${event}/live-location/position`,
    {
      sessionId: session,
      longitude: -35.712345,
      latitude: -9.678912,
      accuracy: 12,
      timestamp: Date.now(),
      ...extra,
    },
    s,
  );
}
const positions = (event: string, s = alice) =>
  call('GET', `/events/${event}/live-location/participants`, undefined, s);
describe.skipIf(!url)('Parte 20 PostgreSQL/PostGIS', () => {
  beforeAll(async () => {
    const config = parseEnv({
        NODE_ENV: 'test',
        DATABASE_URL: url,
        DATABASE_SSL: process.env.DATABASE_SSL ?? 'disable',
      }),
      opts = {
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
      socialStorage: storage,
    });
    await app.ready();
    alice = await account('events_alice');
    bob = await account('events_bob');
    charlie = await account('events_charlie');
  }, 30000);
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE social_events,groups,social_blocks,auth_rate_limits CASCADE',
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
  it('20A cria, pesquisa região/tipo/data e mantém GPS/feed desligados', async () => {
    const e = await event({
      description: 'á'.repeat(4000),
      rules: 'á'.repeat(4000),
    });
    expect(e.description).toHaveLength(4000);
    expect(e).toMatchObject({
      title: 'Café dos motociclistas',
      status: 'scheduled',
      confirmed_count: 1,
    });
    const r = await call(
      'GET',
      '/events?city=Macei%C3%B3&state=AL&type=meetup',
      undefined,
      bob,
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().items.map((x: { id: string }) => x.id)).toEqual([e.id]);
    expect(
      (await call('GET', '/events?state=SP', undefined, bob)).json().items,
    ).toEqual([]);
    expect(
      (await pool.query('SELECT * FROM live_location_sessions')).rowCount,
    ).toBe(0);
    expect((await pool.query('SELECT * FROM social_posts')).rowCount).toBe(0);
    expect(
      (await call('GET', `/events/${e.id}/map`, undefined, bob)).json().event
        .meeting_point.coordinates,
    ).toEqual([-35.7, -9.6]);
  });
  it('20A criação é idempotente e identidade vem da sessão', async () => {
    const b = body();
    const a = await call('POST', '/events', b, alice),
      again = await call('POST', '/events', b, alice);
    expect(again.json().event.id).toBe(a.json().event.id);
    expect(
      (await call('POST', '/events', { ...b, organizerId: bob.id }, alice))
        .statusCode,
    ).toBe(400);
  });
  it('20A edita com revisão, impede terceiro e não reabre cancelado', async () => {
    const e = await event();
    const b = body({ title: 'Novo local', revision: 1 });
    expect((await call('PATCH', `/events/${e.id}`, b, bob)).statusCode).toBe(
      403,
    );
    expect((await call('PATCH', `/events/${e.id}`, b, alice)).statusCode).toBe(
      200,
    );
    expect((await call('PATCH', `/events/${e.id}`, b, alice)).statusCode).toBe(
      409,
    );
    await call('POST', `/events/${e.id}/cancel`, {}, alice);
    expect(
      (await call('PATCH', `/events/${e.id}`, { ...b, revision: 3 }, alice))
        .statusCode,
    ).toBe(409);
    expect((await join(e.id)).statusCode).toBe(409);
  });
  it('20A convite privado não aparece na busca externa e não é acesso por ID', async () => {
    const e = await event({ visibility: 'invite' });
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    expect((await call('GET', '/events', undefined, bob)).json().items).toEqual(
      [],
    );
    expect((await call('GET', `/events/${e.id}`)).statusCode).toBe(401);
  });
  it('20A versão aprovada de rota é estável após edição', async () => {
    const route = randomUUID(),
      plan = {
        id: route,
        version: 1,
        name: 'Rota sintética',
        kind: 'route',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-35.7, -9.6],
            [-35.71, -9.61],
          ],
        },
        distanceMeters: 1500,
        verification: 'suggested',
        startLine: null,
        direction: null,
      };
    await pool.query(
      "INSERT INTO routes(id,owner_id,kind,name,geometry,distance_meters,source,status) VALUES($1,$2,'route','Rota sintética',public.ST_GeomFromGeoJSON($3),1500,'manual','approved')",
      [route, alice.id, JSON.stringify(plan.geometry)],
    );
    await pool.query(
      'INSERT INTO route_versions(route_id,version,plan) VALUES($1,1,$2)',
      [route, JSON.stringify(plan)],
    );
    const e = await event({ eventType: 'ride', routeId: route });
    await pool.query('UPDATE routes SET version=2 WHERE id=$1', [route]);
    const r = await call('GET', `/events/${e.id}/map`, undefined, bob);
    expect(r.json().route.plan.version).toBe(1);
    expect(r.json().route.plan.geometry).toEqual(plan.geometry);
  });
  it('20B confirma sem GPS, evita duplicação e cancela presença', async () => {
    const e = await event();
    await join(e.id);
    await join(e.id);
    expect(
      (
        await pool.query(
          'SELECT * FROM event_participants WHERE event_id=$1 AND user_id=$2',
          [e.id, bob.id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (await pool.query('SELECT * FROM live_location_sessions')).rowCount,
    ).toBe(0);
    await call('DELETE', `/events/${e.id}/rsvp`, undefined, bob);
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).json().event
        .participation_status,
    ).toBe('cancelled');
  });
  it('20B confirmações simultâneas respeitam capacidade e liberam vaga', async () => {
    const e = await event({ capacity: 2 });
    const r = await Promise.all([join(e.id, bob), join(e.id, charlie)]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const winner = r[0]!.statusCode === 200 ? bob : charlie,
      loser = winner === bob ? charlie : bob;
    await call('DELETE', `/events/${e.id}/rsvp`, undefined, winner);
    expect((await join(e.id, loser)).statusCode).toBe(200);
  });
  it('20B interesse, aprovação, rejeição, remoção e lista protegida', async () => {
    const e = await event({ joinPolicy: 'approval' });
    await join(e.id, bob, 'interested');
    await join(e.id);
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).json().event
        .participation_status,
    ).toBe('pending');
    expect(
      (await call('GET', `/events/${e.id}/participants`, undefined, charlie))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'PATCH',
          `/events/${e.id}/participants/${bob.id}`,
          { status: 'confirmed' },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', `/events/${e.id}/participants`, undefined, bob)).json()
        .items.length,
    ).toBe(2);
    await call(
      'PATCH',
      `/events/${e.id}/participants/${bob.id}`,
      { status: 'removed' },
      alice,
    );
    expect((await join(e.id)).statusCode).toBe(403);
  });
  it('20B convite nominal não confirma automaticamente, só a conta destinatária aceita', async () => {
    const e = await event({ visibility: 'invite' });
    const b = {
        userId: bob.id,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      i = await call('POST', `/events/${e.id}/invitations`, b, alice);
    expect(i.statusCode, i.body).toBe(200);
    const invitation = i.json().invitation.id;
    expect(
      (await call('GET', '/events/invitations/mine', undefined, bob)).json()
        .items,
    ).toHaveLength(1);
    expect(
      (
        await pool.query('SELECT * FROM event_participants WHERE user_id=$1', [
          bob.id,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await call(
          'POST',
          `/events/invitations/${invitation}/accept`,
          {},
          charlie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/events/invitations/${invitation}/accept`, {}, bob))
        .statusCode,
    ).toBe(200);
    expect(
      (await pool.query('SELECT * FROM live_location_sessions')).rowCount,
    ).toBe(0);
  });
  it('20B convite expirado/revogado perde acesso e rejeição remove convite', async () => {
    const e = await event({ visibility: 'invite' });
    const i = (
      await call(
        'POST',
        `/events/${e.id}/invitations`,
        {
          userId: bob.id,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        alice,
      )
    ).json().invitation.id;
    await pool.query(
      "UPDATE event_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
      [i],
    );
    expect(
      (await call('POST', `/events/invitations/${i}/accept`, {}, bob))
        .statusCode,
    ).not.toBe(200);
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).statusCode,
    ).toBe(404);
  });
  it('20B bloqueio impede busca, convite e mapa', async () => {
    const e = await ongoing();
    await join(e.id);
    await pool.query(
      'INSERT INTO social_blocks(blocker_id,blocked_id) VALUES($1,$2)',
      [alice.id, bob.id],
    );
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    expect((await positions(e.id, bob)).statusCode).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/events/${e.id}/invitations`,
          {
            userId: bob.id,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
          alice,
        )
      ).statusCode,
    ).toBe(404);
  });
  it('20B grupo privado exige cargo de criação, associação e reavalia despromoção', async () => {
    const g = (
      await call(
        'POST',
        '/groups',
        {
          creationKey: randomUUID(),
          name: 'Grupo privado',
          privacyType: 'private',
          discoveryMode: 'listed',
          joinPolicy: 'approval',
          postingPolicy: 'members',
          rules: [],
        },
        alice,
      )
    ).json().group;
    const e = await event({ visibility: 'group', groupId: g.id });
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    await call(
      'POST',
      `/groups/${g.id}/join`,
      { acceptRules: true, rulesVersion: 1 },
      bob,
    );
    await call(
      'POST',
      `/groups/${g.id}/join-requests/${bob.id}/approve`,
      {},
      alice,
    );
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/events',
          body({ visibility: 'group', groupId: g.id }),
          bob,
        )
      ).statusCode,
    ).toBe(403);
    await call(
      'PATCH',
      `/groups/${g.id}/members/${bob.id}/role`,
      { role: 'admin' },
      alice,
    );
    const own = await call(
      'POST',
      '/events',
      body({ visibility: 'group', groupId: g.id }),
      bob,
    );
    expect(own.statusCode, own.body).toBe(201);
    await call(
      'PATCH',
      `/groups/${g.id}/members/${bob.id}/role`,
      { role: 'member' },
      alice,
    );
    expect(
      (await call('POST', `/events/${own.json().event.id}/cancel`, {}, bob))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/events/${own.json().event.id}/cancel`, {}, alice))
        .statusCode,
    ).toBe(200);
  });
  it('20C mapa não ativa compartilhamento, só confirmação em evento em andamento pode consentir', async () => {
    const e = await event();
    await join(e.id);
    expect((await start(e.id)).statusCode).toBe(403);
    await pool.query(
      "UPDATE social_events SET starts_at=now()-interval '1 minute' WHERE id=$1",
      [e.id],
    );
    expect((await start(e.id, charlie)).statusCode).toBe(403);
    expect((await positions(e.id)).json().items).toEqual([]);
    expect(
      (await pool.query('SELECT * FROM live_location_sessions')).rowCount,
    ).toBe(0);
  });
  it('20C sessão exige consentimento e não pode ser ativada por administrador em nome alheio', async () => {
    const e = await ongoing();
    await join(e.id);
    expect((await start(e.id, bob, { consent: false })).statusCode).toBe(400);
    expect((await start(e.id, alice, { userId: bob.id })).statusCode).toBe(400);
    const r = await start(e.id);
    expect(r.statusCode, r.body).toBe(200);
    expect((await publish(e.id, r.json().session.id, alice)).statusCode).toBe(
      410,
    );
  });
  it('20C público só organizadores filtra antes de serializar e respeita bloqueio entre membros', async () => {
    const e = await ongoing();
    await join(e.id);
    await join(e.id, charlie);
    const r = await start(e.id, bob, { audience: 'organizers' });
    expect((await publish(e.id, r.json().session.id)).statusCode).toBe(200);
    expect((await positions(e.id)).json().items).toHaveLength(1);
    expect((await positions(e.id, charlie)).json().items).toEqual([]);
    await pool.query(
      'INSERT INTO social_blocks(blocker_id,blocked_id) VALUES($1,$2)',
      [bob.id, alice.id],
    );
    expect((await positions(e.id)).json().items).toEqual([]);
  });
  it('20C precisão aproximada nunca persiste coordenada original', async () => {
    const e = await ongoing();
    await join(e.id);
    const r = await start(e.id, bob, { precision: 'approximate' });
    expect((await publish(e.id, r.json().session.id)).statusCode).toBe(200);
    const p = (await pool.query('SELECT * FROM live_location_positions'))
      .rows[0];
    expect(p.longitude).toBe(-35.71);
    expect(p.latitude).toBe(-9.68);
    expect(p.accuracy).toBeGreaterThanOrEqual(1600);
    expect((await positions(e.id)).json().items[0].precision_mode).toBe(
      'approximate',
    );
  });
  it('20C revogação remove imediatamente e sessão velha não reativa nem encerra a nova', async () => {
    const e = await ongoing();
    await join(e.id);
    const s = (await start(e.id)).json().session.id;
    await publish(e.id, s);
    const next = (await start(e.id)).json().session.id;
    await call(
      'POST',
      `/events/${e.id}/live-location/stop`,
      { sessionId: s },
      bob,
    );
    expect((await publish(e.id, s)).statusCode).toBe(410);
    expect((await publish(e.id, next)).statusCode).toBe(200);
    await call(
      'POST',
      `/events/${e.id}/live-location/stop`,
      { sessionId: next },
      bob,
    );
    expect((await positions(e.id)).json().items).toEqual([]);
    expect(
      (await pool.query('SELECT * FROM live_location_positions')).rowCount,
    ).toBe(0);
  });
  it('20C expiração bloqueia leitura/envio mesmo antes da limpeza', async () => {
    const e = await ongoing();
    await join(e.id);
    const s = (await start(e.id)).json().session.id;
    await publish(e.id, s);
    await pool.query(
      "UPDATE live_location_sessions SET started_at=now()-interval '1 hour',expires_at=now()-interval '1 second' WHERE id=$1",
      [s],
    );
    expect((await positions(e.id)).json().items).toEqual([]);
    expect((await publish(e.id, s)).statusCode).toBe(410);
    await cleanupLive(pool);
    expect(
      (await pool.query('SELECT * FROM live_location_positions')).rowCount,
    ).toBe(0);
  });
  it('20D posição velha é identificada e removida por TTL sem mover artificialmente', async () => {
    const e = await ongoing();
    await join(e.id);
    const s = (await start(e.id)).json().session.id;
    await publish(e.id, s);
    await pool.query(
      "UPDATE live_location_positions SET received_at=now()-interval '16 seconds'",
    );
    expect((await positions(e.id)).json().items[0].freshness).toBe('stale');
    await pool.query(
      "UPDATE live_location_positions SET expires_at=now()-interval '1 second'",
    );
    expect((await positions(e.id)).json().items).toEqual([]);
  });
  it('20D timestamps antigos, duplicação, ordem e frequência são rejeitados', async () => {
    const e = await ongoing();
    await join(e.id);
    const s = (await start(e.id)).json().session.id,
      t = Date.now();
    expect(
      (await publish(e.id, s, bob, { timestamp: t - 20000 })).statusCode,
    ).toBe(400);
    expect((await publish(e.id, s, bob, { timestamp: t })).statusCode).toBe(
      200,
    );
    expect((await publish(e.id, s, bob, { timestamp: t })).statusCode).toBe(
      400,
    );
    expect((await publish(e.id, s, bob, { timestamp: t + 1 })).statusCode).toBe(
      429,
    );
  });
  for (const action of [
    'cancel',
    'finish',
    'leave',
    'remove',
    'edit',
    'scheduled-end',
  ])
    it(`20E ${action} invalida GPS e destinatários`, async () => {
      const e = await ongoing();
      await join(e.id);
      const s = (await start(e.id)).json().session.id;
      await publish(e.id, s);
      if (action === 'leave')
        await call('DELETE', `/events/${e.id}/rsvp`, undefined, bob);
      else if (action === 'remove')
        await call(
          'PATCH',
          `/events/${e.id}/participants/${bob.id}`,
          { status: 'removed' },
          alice,
        );
      else if (action === 'edit')
        await call('PATCH', `/events/${e.id}`, body({ revision: 1 }), alice);
      else if (action === 'scheduled-end')
        await pool.query(
          "UPDATE social_events SET starts_at=now()-interval '2 minutes',ends_at=now()-interval '1 minute' WHERE id=$1",
          [e.id],
        );
      else await call('POST', `/events/${e.id}/${action}`, {}, alice);
      const read = await positions(e.id);
      expect(read.statusCode === 403 || read.json().items.length === 0).toBe(
        true,
      );
      expect((await publish(e.id, s)).statusCode).not.toBe(200);
      await cleanupLive(pool);
      expect(
        (await pool.query('SELECT * FROM live_location_positions')).rowCount,
      ).toBe(0);
    });
  it('20E exige CSRF e impede enumeração entre eventos', async () => {
    const e = await ongoing();
    await join(e.id);
    expect((await start(e.id, bob, { audience: 'public' })).statusCode).toBe(
      400,
    );
    expect(
      (
        await call(
          'POST',
          `/events/${e.id}/rsvp`,
          { status: 'confirmed' },
          bob,
          { 'x-csrf-token': 'bad' },
        )
      ).statusCode,
    ).toBe(403);
    const r = await positions(e.id, charlie);
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain('longitude');
    const a = await positions(e.id);
    expect(a.headers['cache-control']).toContain('no-store');
  });
  it('20B designação exige principal, coorganizador perde cargo quando removido', async () => {
    const e = await event();
    await join(e.id);
    await join(e.id, charlie);
    expect(
      (await call('POST', `/events/${e.id}/organizers/${bob.id}`, {}, charlie))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/events/${e.id}/organizers/${bob.id}`, {}, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).json().event
        .can_manage,
    ).toBe(true);
    await call(
      'PATCH',
      `/events/${e.id}/participants/${bob.id}`,
      { status: 'removed' },
      alice,
    );
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).json().event
        .can_manage,
    ).toBe(false);
    expect(
      (await call('POST', `/events/${e.id}/cancel`, {}, bob)).statusCode,
    ).toBe(403);
  });
  it('20B convite pode ser recusado e revogado; interesse não contorna revogação', async () => {
    const e = await event({ visibility: 'invite' }),
      expiresAt = new Date(Date.now() + 3600000).toISOString();
    const i = (
      await call(
        'POST',
        `/events/${e.id}/invitations`,
        { userId: bob.id, expiresAt },
        alice,
      )
    ).json().invitation.id;
    expect((await join(e.id, bob, 'interested')).statusCode).toBe(403);
    expect(
      (
        await call('GET', `/events/${e.id}/invitations`, undefined, alice)
      ).json().items,
    ).toHaveLength(1);
    expect(
      (await call('GET', `/events/${e.id}/invitations`, undefined, bob))
        .statusCode,
    ).toBe(403);
    await call('DELETE', `/events/${e.id}/invitations/${i}`, undefined, alice);
    expect(
      (await call('GET', `/events/${e.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    const next = (
      await call(
        'POST',
        `/events/${e.id}/invitations`,
        { userId: bob.id, expiresAt },
        alice,
      )
    ).json().invitation.id;
    expect(
      (await call('POST', `/events/invitations/${next}/reject`, {}, bob))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/events/invitations/mine', undefined, bob)).json()
        .items,
    ).toHaveLength(0);
  });
  it('20E desbloquear não ressuscita consentimento revogado no banco', async () => {
    const e = await ongoing();
    await join(e.id);
    const s = (await start(e.id)).json().session.id;
    await publish(e.id, s);
    await pool.query(
      'INSERT INTO social_blocks(blocker_id,blocked_id) VALUES($1,$2)',
      [bob.id, charlie.id],
    );
    expect(
      (await pool.query('SELECT * FROM live_location_positions')).rowCount,
    ).toBe(0);
    await pool.query('DELETE FROM social_blocks');
    expect((await publish(e.id, s)).statusCode).toBe(410);
  });
  it('20E logout revoga GPS no banco mesmo depois de invalidar o cookie', async () => {
    const e = await ongoing();
    await join(e.id);
    const s = (await start(e.id)).json().session.id;
    await publish(e.id, s);
    expect((await call('POST', '/auth/logout', {}, bob)).statusCode).toBe(200);
    expect(
      (await pool.query('SELECT * FROM live_location_positions')).rowCount,
    ).toBe(0);
    const login = await call('POST', '/auth/login', {
      email: 'events_bob@example.com',
      password: 'frase de senha longa e segura',
    });
    expect(login.statusCode).toBe(200);
    bob = {
      id: login.json().user.id,
      cookie: String(login.headers['set-cookie']).split(';')[0]!,
      csrf: login.json().csrfToken,
    };
    expect((await publish(e.id, s)).statusCode).toBe(410);
  });
  it('20E retornar ao grupo não ressuscita consentimento nem cache de cargo', async () => {
    const g = (
      await call(
        'POST',
        '/groups',
        {
          creationKey: randomUUID(),
          name: 'Grupo GPS',
          privacyType: 'public',
          joinPolicy: 'immediate',
          postingPolicy: 'members',
          discoveryMode: 'listed',
          rules: [],
        },
        alice,
      )
    ).json().group;
    await call(
      'POST',
      `/groups/${g.id}/join`,
      { acceptRules: true, rulesVersion: 1 },
      bob,
    );
    const e = await ongoing({ visibility: 'group', groupId: g.id });
    await join(e.id);
    const s = (await start(e.id)).json().session.id;
    await publish(e.id, s);
    await call('POST', `/groups/${g.id}/leave`, {}, bob);
    expect(
      (await pool.query('SELECT * FROM live_location_positions')).rowCount,
    ).toBe(0);
    await call(
      'POST',
      `/groups/${g.id}/join`,
      { acceptRules: true, rulesVersion: 1 },
      bob,
    );
    expect((await publish(e.id, s)).statusCode).toBe(410);
  });
  it('20A imagem privada reutiliza processamento, mantém autorização e não pode ser anexada ao feed', async () => {
    const e = await event({ visibility: 'invite' });
    const bytes = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#ff202d' },
    })
      .png()
      .toBuffer();
    const upload = await call('POST', '/social/media', bytes, alice, {
      'content-type': 'image/png',
    });
    expect(upload.statusCode, upload.body).toBe(201);
    const media = upload.json().media.id;
    expect(
      (await call('PATCH', `/events/${e.id}/image`, { mediaId: media }, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', `/social/media/${media}`, undefined, bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/social/media/${media}`, undefined, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          { text: 'tentativa', visibility: 'public', mediaIds: [media] },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    await pool.query(
      "UPDATE social_post_media SET created_at=now()-interval '2 hours'",
    );
    await pool.query('UPDATE social_media_cleanup SET available_at=now()');
    await cleanupSocialMedia(pool, storage);
    expect(
      (await call('GET', `/social/media/${media}`, undefined, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('DELETE', `/social/media/${media}`, {}, alice)).statusCode,
    ).toBe(404);
  });
  it('20D Ride salva associação autorizada mesmo após sair do evento sem ativar GPS social', async () => {
    const e = await ongoing({ eventType: 'ride' });
    await join(e.id);
    const auth = await call(
      'POST',
      `/events/${e.id}/ride-association`,
      {},
      bob,
    );
    expect(auth.statusCode, auth.body).toBe(200);
    const bike = (
      await call(
        'POST',
        '/motorcycles',
        { brand: 'Honda', model: 'CB 500', year: 2024, displacementCc: 500 },
        bob,
      )
    ).json().motorcycle.id;
    const now = Date.now(),
      payload = {
        clientId: randomUUID(),
        motorcycleId: bike,
        mode: 'passeio',
        visibility: 'private',
        startedAt: now,
        endedAt: now + 1000,
        intervals: [{ start: now, end: now + 1000 }],
        points: [
          {
            latitude: -9.6,
            longitude: -35.7,
            accuracy: 8,
            speed: 0,
            heading: null,
            altitude: null,
            segment: 0,
            timestamp: now,
          },
        ],
        event: { id: e.id, authorizationId: auth.json().authorizationId },
      };
    await call('DELETE', `/events/${e.id}/rsvp`, undefined, bob);
    const saved = await persistRide(pool, bob.id, payload);
    expect(
      (await pool.query('SELECT event_id FROM rides WHERE id=$1', [saved.id]))
        .rows[0].event_id,
    ).toBe(e.id);
    expect(
      (await pool.query('SELECT * FROM live_location_sessions')).rowCount,
    ).toBe(0);
    expect((await pool.query('SELECT * FROM social_posts')).rowCount).toBe(0);
    await expect(
      persistRide(pool, alice.id, { ...payload, clientId: randomUUID() }),
    ).rejects.toThrow();
  });
  it('20E mede consultas limitadas a 10, 50 e 200 posições, limpeza e índices', async () => {
    const e = await ongoing();
    const users = Array.from({ length: 200 }, (_, i) => ({
      id: randomUUID(),
      session: randomUUID(),
      name: `load_${i}_${randomUUID().slice(0, 6)}`,
    }));
    await pool.query(
      "INSERT INTO users(id,display_name,username,email,password_hash,terms_version,privacy_version) SELECT (x->>'id')::uuid,x->>'name',x->>'name',(x->>'name')||'@example.com','synthetic','test','test' FROM jsonb_array_elements($1::jsonb)x",
      [JSON.stringify(users)],
    );
    await pool.query(
      "INSERT INTO event_participants(event_id,user_id,participation_status) SELECT $1,(x->>'id')::uuid,'confirmed' FROM jsonb_array_elements($2::jsonb)x",
      [e.id, JSON.stringify(users)],
    );
    const results = [];
    for (const n of [10, 50, 200]) {
      const batch = users.slice(0, n);
      await pool.query('DELETE FROM live_location_sessions WHERE event_id=$1', [
        e.id,
      ]);
      await pool.query(
        "INSERT INTO live_location_sessions(id,event_id,user_id,audience_scope,precision_mode,consent_version,expires_at) SELECT (x->>'session')::uuid,$1,(x->>'id')::uuid,'confirmed','approximate','live-v1',now()+interval '1 hour' FROM jsonb_array_elements($2::jsonb)x",
        [e.id, JSON.stringify(batch)],
      );
      await pool.query(
        "INSERT INTO live_location_positions(session_id,event_id,user_id,longitude,latitude,accuracy,recorded_at,expires_at) SELECT (x->>'session')::uuid,$1,(x->>'id')::uuid,-35.7,-9.6,1600,now(),now()+interval '30 seconds' FROM jsonb_array_elements($2::jsonb)x",
        [e.id, JSON.stringify(batch)],
      );
      const memory = process.memoryUsage().heapUsed,
        cpu = process.cpuUsage(),
        start = performance.now();
      let size = 0;
      for (let i = 0; i < 10; i++) {
        const response = await positions(e.id);
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().items).toHaveLength(n);
        size = Buffer.byteLength(response.body);
      }
      results.push({
        participants: n,
        reads: 10,
        totalMs: Math.round(performance.now() - start),
        cpu: process.cpuUsage(cpu),
        heapDeltaBytes: process.memoryUsage().heapUsed - memory,
        payloadBytes: size,
      });
    }
    const index = (
      await pool.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename IN ('social_events','live_location_positions')",
        [schema],
      )
    ).rows.map((x) => x.indexname);
    expect(index).toContain('events_point');
    expect(index).toContain('live_positions_event');
    expect((await start(e.id, alice)).statusCode).toBe(409);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL enable_seqscan=off');
      const plan = await client.query(
        'EXPLAIN SELECT id FROM social_events WHERE meeting_point && public.ST_MakeEnvelope(-36,-10,-35,-9,4326)',
      );
      expect(JSON.stringify(plan.rows)).toContain('events_point');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    await pool.query(
      "UPDATE live_location_positions SET expires_at=now()-interval '1 second'",
    );
    const started = performance.now();
    await cleanupLive(pool);
    const cleanupMs = Math.round(performance.now() - started);
    expect(
      (await pool.query('SELECT * FROM live_location_positions')).rowCount,
    ).toBe(0);
    await writeFile(
      '../../.local/parte20-performance.json',
      JSON.stringify(
        {
          results,
          cleanupMs,
          scope:
            'Synthetic single-process local PostgreSQL, not mobile or production capacity',
        },
        null,
        2,
      ),
    );
  }, 30000);
});
