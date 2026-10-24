import { randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { cleanupSocialMedia } from '../src/modules/social/media.js';
const url = process.env.TEST_DATABASE_URL,
  schema = `groups_test_${randomUUID().replaceAll('-', '')}`;
let pool: pg.Pool, admin: pg.Pool, app: FastifyInstance;
type Session = { id: string; cookie: string; csrf: string };
let alice: Session, bob: Session, charlie: Session;
const files = new Map<string, Buffer>();
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
  const r = await call('POST', '/auth/register', {
    displayName: name,
    username: name,
    email: `${name}@example.com`,
    password: 'frase de senha longa e segura',
    acceptTerms: true,
    termsVersion: 'prelaunch-draft',
    privacyVersion: 'prelaunch-draft',
  });
  expect(r.statusCode, r.body).toBe(201);
  const login = await call('POST', '/auth/login', {
    email: `${name}@example.com`,
    password: 'frase de senha longa e segura',
  });
  return {
    id: login.json().user.id,
    cookie: String(login.headers['set-cookie']).split(';')[0]!,
    csrf: login.json().csrfToken,
  };
}
const body = (extra: Record<string, unknown> = {}) => ({
  creationKey: randomUUID(),
  name: 'Motociclistas Alagoas',
  description: 'Comunidade de passeios tranquilos',
  privacyType: 'public',
  discoveryMode: 'listed',
  joinPolicy: 'immediate',
  postingPolicy: 'members',
  membersCanInvite: false,
  city: 'Maceió',
  state: 'AL',
  categories: ['Naked'],
  rules: ['Respeitar os integrantes'],
  ...extra,
});
async function group(extra: Record<string, unknown> = {}) {
  const r = await call('POST', '/groups', body(extra), alice);
  expect(r.statusCode, r.body).toBe(201);
  return r.json().group;
}
async function join(id: string, s = bob, version = 1) {
  return call(
    'POST',
    `/groups/${id}/join`,
    { acceptRules: true, rulesVersion: version },
    s,
  );
}
async function post(
  id: string,
  s = alice,
  extra: Record<string, unknown> = {},
) {
  const r = await call(
    'POST',
    `/groups/${id}/posts`,
    { text: 'Texto restrito do grupo', visibility: 'public', ...extra },
    s,
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json().post;
}
async function photo(s = alice) {
  const bytes = await sharp({
    create: { width: 50, height: 40, channels: 3, background: '#bc1327' },
  })
    .png()
    .toBuffer();
  const r = await call('POST', '/social/media', bytes, s, {
    'content-type': 'image/png',
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().media;
}
async function edit(id: string, extra: Record<string, unknown>, s = alice) {
  return call(
    'PATCH',
    `/groups/${id}`,
    body({ ...extra, confirmPrivacy: true }),
    s,
  );
}
async function invite(id: string, extra: Record<string, unknown> = {}) {
  const r = await call(
    'POST',
    `/groups/${id}/invitations`,
    { expiresAt: new Date(Date.now() + 86400000).toISOString(), ...extra },
    alice,
  );
  expect(r.statusCode, r.body).toBe(200);
  return r.json().invitation;
}
const accept = (i: { id: string; token: string | null }, s = bob) =>
  call(
    'POST',
    `/groups/invitations/${i.id}/accept`,
    { token: i.token, acceptRules: true, rulesVersion: 1 },
    s,
  );
describe.skipIf(!url)('Parte 19 grupos PostgreSQL', () => {
  it('19A idempotência de criação é preservada após transferência de propriedade', async () => {
    const b = body(),
      r = await call('POST', '/groups', b, alice);
    expect(r.statusCode).toBe(201);
    const key = r.json().group.id;
    await join(key);
    await call(
      'POST',
      `/groups/${key}/transfer-ownership`,
      { userId: bob.id, confirm: true },
      alice,
    );
    const again = await call('POST', '/groups', b, alice);
    expect(again.statusCode, again.body).toBe(201);
    expect(again.json().group.id).toBe(key);
    expect((await pool.query('SELECT id FROM groups')).rowCount).toBe(1);
  });
  it('19B convite criado por membro respeita aprovação prévia', async () => {
    const g = await group({ privacyType: 'private', membersCanInvite: true });
    await join(g.id);
    await call(
      'POST',
      `/groups/${g.id}/join-requests/${bob.id}/approve`,
      {},
      alice,
    );
    const r = await call(
      'POST',
      `/groups/${g.id}/invitations`,
      {
        userId: charlie.id,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      bob,
    );
    expect(r.statusCode, r.body).toBe(200);
    expect((await accept(r.json().invitation, charlie)).statusCode).toBe(200);
    expect(
      (await call('GET', `/groups/${g.id}`, undefined, charlie)).json().group
        .member_status,
    ).toBe('pending');
    expect(
      (await call('GET', `/groups/${g.id}/posts`, undefined, charlie))
        .statusCode,
    ).toBe(403);
  });
  it('19B convite perde autorização após revogação do cargo do criador', async () => {
    const g = await group();
    await join(g.id);
    await call(
      'PATCH',
      `/groups/${g.id}/members/${bob.id}/role`,
      { role: 'admin' },
      alice,
    );
    const r = await call(
      'POST',
      `/groups/${g.id}/invitations`,
      { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      bob,
    );
    expect(r.statusCode).toBe(200);
    await call(
      'PATCH',
      `/groups/${g.id}/members/${bob.id}/role`,
      { role: 'member' },
      alice,
    );
    expect((await accept(r.json().invitation, charlie)).statusCode).toBe(403);
  });
  it('19A envio repetido de capa é idempotente e não apaga o arquivo associado', async () => {
    const g = await group(),
      m = await photo();
    for (let n = 0; n < 2; n++)
      expect(
        (await call('PATCH', `/groups/${g.id}/images`, { cover: m.id }, alice))
          .statusCode,
      ).toBe(200);
    expect(
      (await call('GET', `/social/media/${m.id}`, undefined, alice)).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query('SELECT id FROM social_post_media WHERE group_id=$1', [
          g.id,
        ])
      ).rowCount,
    ).toBe(1);
  });
  it('19C resumo seguro de Ride revoga dados ao mudar privacidade sem divulgar GPS', async () => {
    const g = await group({ privacyType: 'private' }),
      bike = await call(
        'POST',
        '/motorcycles',
        { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
        alice,
      ),
      start = Date.now() - 60000;
    const ride = await call(
      'POST',
      '/rides',
      {
        clientId: randomUUID(),
        motorcycleId: bike.json().motorcycle.id,
        mode: 'misto',
        visibility: 'public',
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
      alice,
    );
    expect(ride.statusCode, ride.body).toBe(201);
    const key = ride.json().id;
    expect((await pool.query('SELECT * FROM social_posts')).rowCount).toBe(0);
    const p = await post(g.id, alice, { rideId: key });
    expect(p.ride).toMatchObject({
      id: key,
      locationPolicy: 'summary-only-v1',
    });
    expect(JSON.stringify(p)).not.toMatch(
      /longitude|latitude|points|maximum_kmh|speed|inclination/,
    );
    await pool.query("UPDATE rides SET visibility='private' WHERE id=$1", [
      key,
    ]);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, alice)).json().post
        .ride,
    ).toBeNull();
    await call('DELETE', `/groups/${g.id}`, { confirm: true }, alice);
    expect(
      (await pool.query('SELECT id FROM rides WHERE id=$1', [key])).rowCount,
    ).toBe(1);
  });
  for (const sort of ['name', 'members'])
    it(`19A pagina ordenação ${sort} sem carregar todos os grupos`, async () => {
      await group({ name: 'Alagoas' });
      await group({ name: 'Brasil' });
      const a = (
        await call('GET', `/groups?sort=${sort}&limit=1`, undefined, bob)
      ).json();
      expect(a.nextCursor).toBeTruthy();
      const b = (
        await call(
          'GET',
          `/groups?sort=${sort}&limit=1&cursor=${a.nextCursor}`,
          undefined,
          bob,
        )
      ).json();
      expect(b.items[0].id).not.toBe(a.items[0].id);
    });
  it('19D contadores transacionais acompanham solicitações, participação e moderação', async () => {
    const g = await group({ privacyType: 'private' });
    await join(g.id);
    expect(
      (
        await pool.query(
          'SELECT member_count,pending_count FROM groups WHERE id=$1',
          [g.id],
        )
      ).rows[0],
    ).toEqual({ member_count: 1, pending_count: 1 });
    await call(
      'POST',
      `/groups/${g.id}/join-requests/${bob.id}/approve`,
      {},
      alice,
    );
    const p = await post(g.id);
    await call(
      'POST',
      `/groups/${g.id}/moderate/posts/${p.id}`,
      { reason: 'Revisão' },
      alice,
    );
    expect(
      (
        await pool.query(
          'SELECT member_count,pending_count,post_count FROM groups WHERE id=$1',
          [g.id],
        )
      ).rows[0],
    ).toEqual({ member_count: 2, pending_count: 0, post_count: 0 });
  });
  it('19D denúncia interna redige denunciante, analisa e mantém encaminhamento da plataforma', async () => {
    const g = await group();
    await join(g.id);
    expect(
      (
        await call(
          'POST',
          '/social/reports',
          {
            kind: 'group_member',
            id: bob.id,
            groupId: g.id,
            reason: 'personal_data',
            detail: 'Exposição de dados',
          },
          alice,
        )
      ).statusCode,
    ).toBe(201);
    const list = await call('GET', `/groups/${g.id}/reports`, undefined, alice);
    expect(list.statusCode, list.body).toBe(200);
    expect(list.body).not.toContain('reporter_id');
    const report = list.json().items[0];
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/reports/${report.id}/review`,
          { reason: 'Encaminhado' },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          'SELECT status,escalation FROM social_reports WHERE id=$1',
          [report.id],
        )
      ).rows[0],
    ).toEqual({ status: 'pending', escalation: 'platform' });
    expect(
      (await call('DELETE', `/groups/${g.id}/reports/${report.id}`, {}, alice))
        .statusCode,
    ).toBe(404);
  });
  it('19D perfil privado mantém posts e fotos protegidos até aprovação do seguidor', async () => {
    const g = await group({ privacyType: 'private' }),
      m = await photo(),
      p = await post(g.id, alice, { mediaIds: [m.id] });
    await join(g.id);
    await call(
      'POST',
      `/groups/${g.id}/join-requests/${bob.id}/approve`,
      {},
      alice,
    );
    await pool.query(
      "UPDATE privacy_settings SET profile_visibility='private' WHERE user_id=$1",
      [alice.id],
    );
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/social/media/${m.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    await call('POST', `/social/users/${alice.id}/follow`, {}, bob);
    await call('POST', `/social/requests/${bob.id}/approve`, {}, alice);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(200);
  });
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
      socialStorage: {
        put: async (k, b) => {
          files.set(k, b);
        },
        get: async (k) => {
          if (!files.has(k)) throw Error('missing');
          return files.get(k)!;
        },
        remove: async (k) => {
          files.delete(k);
        },
      },
    });
    await app.ready();
    alice = await account('groups_alice');
    bob = await account('groups_bob');
    charlie = await account('groups_charlie');
  }, 30000);
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE groups,social_posts,social_reports,social_follows,social_blocks,social_media_cleanup,auth_rate_limits CASCADE',
    );
    await pool.query("UPDATE privacy_settings SET profile_visibility='public'");
    files.clear();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  });
  for (const [privacy, discovery] of [
    ['public', 'listed'],
    ['private', 'listed'],
    ['private', 'unlisted'],
  ])
    it(`19A cria ${privacy}/${discovery} com proprietário atômico`, async () => {
      const g = await group({ privacyType: privacy, discoveryMode: discovery });
      expect(g).toMatchObject({
        role: 'owner',
        member_status: 'active',
        member_count: 1,
      });
      const owner = await pool.query(
        "SELECT user_id FROM group_memberships WHERE group_id=$1 AND role='owner'",
        [g.id],
      );
      expect(owner.rows).toEqual([{ user_id: alice.id }]);
    });
  for (const input of [
    { name: '' },
    { name: 'x'.repeat(101) },
    { privacyType: 'secret' },
    { discoveryMode: 'unlisted' },
    { state: 'ZZ' },
    { categories: ['invalid'] },
    { rules: Array(21).fill('r') },
    { owner_id: randomUUID() },
    { membersCanInvite: 'true' },
  ])
    it(`19A rejeita configuração inválida ${Object.keys(input)[0]}`, async () => {
      expect(
        (await call('POST', '/groups', body(input), alice)).statusCode,
      ).toBe(400);
      expect((await pool.query('SELECT * FROM groups')).rowCount).toBe(0);
    });
  it('19A reenvio concorrente cria apenas um grupo e uma associação', async () => {
    const b = body();
    const rs = await Promise.all([
      call('POST', '/groups', b, alice),
      call('POST', '/groups', b, alice),
    ]);
    expect(rs.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(rs[0]!.json().group.id).toBe(rs[1]!.json().group.id);
    expect((await pool.query('SELECT * FROM groups')).rowCount).toBe(1);
  });
  it('19A descoberta, filtros, contagem privada, paginação e dados autorizados', async () => {
    const a = await group(),
      b = await group({ privacyType: 'private' }),
      c = await group({ privacyType: 'private', discoveryMode: 'unlisted' });
    const r = (
      await call(
        'GET',
        '/groups?state=AL&city=Macei%C3%B3&category=Naked&limit=1',
        undefined,
        bob,
      )
    ).json();
    expect(r.items).toHaveLength(1);
    const next = (
      await call(
        'GET',
        `/groups?limit=1&cursor=${r.nextCursor}`,
        undefined,
        bob,
      )
    ).json();
    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).not.toBe(r.items[0].id);
    const all = (await call('GET', '/groups', undefined, bob)).json().items;
    expect(all.map((x: { id: string }) => x.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(
      all.find((x: { id: string }) => x.id === b.id).member_count,
    ).toBeNull();
    expect(
      (await call('GET', `/groups/${c.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/groups?state=SP', undefined, bob)).json().items,
    ).toEqual([]);
    expect(
      (await call('GET', '/groups?q=Motociclistas', undefined, bob)).json()
        .items,
    ).toHaveLength(2);
    expect(JSON.stringify(all)).not.toMatch(/email|owner_id|posts|token_hash/);
  });
  it('19A membro não edita; admin limitado não muda privacidade', async () => {
    const g = await group();
    await join(g.id);
    expect((await edit(g.id, { name: 'Outro' }, bob)).statusCode).toBe(403);
    await call(
      'PATCH',
      `/groups/${g.id}/members/${bob.id}/role`,
      { role: 'admin' },
      alice,
    );
    expect((await edit(g.id, { name: 'Editado' }, bob)).statusCode).toBe(200);
    expect((await edit(g.id, { privacyType: 'private' }, bob)).statusCode).toBe(
      403,
    );
  });
  it('19B entrada exige aceitação, não duplica e não compartilha dados', async () => {
    const g = await group();
    expect(
      (await call('POST', `/groups/${g.id}/join`, {}, bob)).statusCode,
    ).toBe(409);
    expect((await join(g.id)).statusCode).toBe(200);
    expect((await join(g.id)).statusCode).toBe(409);
    expect((await pool.query('SELECT * FROM social_posts')).rowCount).toBe(0);
    expect(
      (await call('GET', '/groups/mine', undefined, bob)).json().items,
    ).toHaveLength(1);
  });
  it('19B solicitação pendente não libera conteúdo e duas aprovações são consistentes', async () => {
    const g = await group({ privacyType: 'private' }),
      p = await post(g.id);
    await join(g.id);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/groups/${g.id}/members`, undefined, bob)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/join-requests/${bob.id}/approve`,
          {},
          charlie,
        )
      ).statusCode,
    ).toBe(403);
    const rs = await Promise.all([
      call(
        'POST',
        `/groups/${g.id}/join-requests/${bob.id}/approve`,
        {},
        alice,
      ),
      call(
        'POST',
        `/groups/${g.id}/join-requests/${bob.id}/approve`,
        {},
        alice,
      ),
    ]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(200);
  });
  it('19B rejeita pedido, permite consultar resultado e cancelar pedido próprio', async () => {
    const g = await group({ privacyType: 'private' });
    await join(g.id);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/join-requests/${bob.id}/reject`,
          {},
          alice,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/groups?filter=pending', undefined, bob)).json()
        .items[0].member_status,
    ).toBe('rejected');
    await join(g.id);
    await call('POST', `/groups/${g.id}/leave`, {}, bob);
    expect(
      (await call('GET', `/groups/${g.id}`, undefined, bob)).json().group
        .member_status,
    ).toBe('cancelled');
  });
  it('19B aprovação não funciona no grupo errado; mudança da política não aprova automaticamente', async () => {
    const a = await group({ privacyType: 'private' }),
      b = await group();
    await join(a.id);
    expect(
      (
        await call(
          'POST',
          `/groups/${b.id}/join-requests/${bob.id}/approve`,
          {},
          alice,
        )
      ).statusCode,
    ).toBe(409);
    await edit(a.id, { privacyType: 'public' });
    expect(
      (await call('GET', `/groups/${a.id}`, undefined, bob)).json().group
        .member_status,
    ).toBe('pending');
  });
  it('19B privado não listado só apresenta com convite válido e aceita explicitamente', async () => {
    const g = await group({
        privacyType: 'private',
        discoveryMode: 'unlisted',
      }),
      p = await post(g.id),
      i = await invite(g.id);
    expect(
      (
        await call(
          'POST',
          `/groups/invitations/${i.id}/preview`,
          { token: 'a'.repeat(43) },
          bob,
        )
      ).statusCode,
    ).toBe(404);
    const preview = await call(
      'POST',
      `/groups/invitations/${i.id}/preview`,
      { token: i.token },
      bob,
    );
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json().group.member_count).toBeNull();
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    expect((await accept(i)).statusCode).toBe(200);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(200);
    const stored = (
      await pool.query('SELECT token_hash FROM group_invitations WHERE id=$1', [
        i.id,
      ])
    ).rows[0].token_hash;
    expect(stored).not.toBe(i.token);
    expect(stored).toHaveLength(64);
  });
  for (const action of [
    'expired',
    'revoked',
    'exhausted',
    'reused',
    'wrong-user',
    'rejected',
  ])
    it(`19B convite ${action} não concede entrada`, async () => {
      const g = await group({ privacyType: 'private' }),
        i = await invite(
          g.id,
          action === 'wrong-user' || action === 'rejected'
            ? { userId: bob.id }
            : {},
        );
      if (action === 'expired')
        await pool.query(
          "UPDATE group_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
          [i.id],
        );
      if (action === 'revoked')
        await call('DELETE', `/groups/${g.id}/invitations/${i.id}`, {}, alice);
      if (action === 'exhausted') await accept(i, charlie);
      if (action === 'reused') {
        await accept(i);
        await call('POST', `/groups/${g.id}/leave`, {}, bob);
      }
      if (action === 'rejected')
        await call('POST', `/groups/invitations/${i.id}/reject`, {}, bob);
      const r = await accept(i, action === 'wrong-user' ? charlie : bob);
      expect(r.statusCode).toBeGreaterThanOrEqual(400);
    });
  it('19B limite de uso é atômico entre destinatários concorrentes', async () => {
    const g = await group({ privacyType: 'private' }),
      i = await invite(g.id);
    const rs = await Promise.all([accept(i, bob), accept(i, charlie)]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 410]);
    expect(
      (
        await pool.query(
          'SELECT usage_count FROM group_invitations WHERE id=$1',
          [i.id],
        )
      ).rows[0].usage_count,
    ).toBe(1);
  });
  it('19B convite por perfil aparece na caixa, pode recusar e membro não convida por padrão', async () => {
    const g = await group();
    await join(g.id);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/invitations`,
          {
            userId: charlie.id,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          bob,
        )
      ).statusCode,
    ).toBe(403);
    const i = await invite(g.id, { userId: charlie.id });
    const inbox = (
      await call('GET', '/groups/invitations/mine', undefined, charlie)
    ).json();
    expect(inbox.items[0].id).toBe(i.id);
    expect(JSON.stringify(inbox)).not.toContain('token_hash');
  });
  it('19B único proprietário, transferência e revogação imediata de cargos', async () => {
    const g = await group();
    await join(g.id);
    expect(
      (await call('POST', `/groups/${g.id}/leave`, {}, alice)).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'PATCH',
          `/groups/${g.id}/members/${bob.id}/role`,
          { role: 'owner' },
          bob,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/transfer-ownership`,
          { userId: charlie.id, confirm: true },
          alice,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/transfer-ownership`,
          { userId: bob.id, confirm: true },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT user_id FROM group_memberships WHERE group_id=$1 AND role='owner'",
          [g.id],
        )
      ).rows,
    ).toEqual([{ user_id: bob.id }]);
    expect(
      (
        await call(
          'PATCH',
          `/groups/${g.id}/members/${bob.id}/role`,
          { role: 'member' },
          alice,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/groups/${g.id}/leave`, {}, alice)).statusCode,
    ).toBe(200);
  });
  it('19B banco impede quebrar o vínculo de proprietário', async () => {
    const g = await group();
    await expect(
      pool.query(
        "UPDATE group_memberships SET status='removed' WHERE group_id=$1 AND user_id=$2",
        [g.id, alice.id],
      ),
    ).rejects.toThrow();
  });
  for (const privacy of ['public', 'private'])
    it(`19C texto, foto, moto, likes, comentários e paginação no grupo ${privacy}`, async () => {
      const g = await group({ privacyType: privacy });
      await join(g.id);
      if (privacy === 'private')
        await call(
          'POST',
          `/groups/${g.id}/join-requests/${bob.id}/approve`,
          {},
          alice,
        );
      const bike = await call(
          'POST',
          '/motorcycles',
          { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
          alice,
        ),
        m = await photo();
      const p = await post(g.id, alice, {
        mediaIds: [m.id],
        motorcycleId: bike.json().motorcycle.id,
      });
      expect(p.motorcycle.model).toBe('CB 650R');
      expect(
        (await call('GET', `/social/media/${m.id}`, undefined, bob)).statusCode,
      ).toBe(200);
      expect(
        (await call('POST', `/social/posts/${p.id}/like`, {}, bob)).json().post
          .likes,
      ).toBe(1);
      await call(
        'POST',
        `/social/posts/${p.id}/comments`,
        { text: 'Bom passeio' },
        bob,
      );
      expect(
        (
          await call('GET', `/social/posts/${p.id}/comments`, undefined, bob)
        ).json().items,
      ).toHaveLength(1);
      await post(g.id);
      const page = (
        await call('GET', `/groups/${g.id}/posts?limit=1`, undefined, bob)
      ).json();
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
      expect(
        (await call('GET', '/social/feed', undefined, bob)).json().items,
      ).toEqual([]);
      expect(
        (await call('GET', '/social/feed/following', undefined, bob)).json()
          .items,
      ).toEqual([]);
    });
  it('19C não associa moto de terceiros nem Ride privado', async () => {
    const g = await group(),
      bike = await call(
        'POST',
        '/motorcycles',
        { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
        bob,
      );
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/posts`,
          {
            text: 'x',
            visibility: 'public',
            motorcycleId: bike.json().motorcycle.id,
          },
          alice,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/posts`,
          { text: 'x', visibility: 'public', rideId: randomUUID() },
          alice,
        )
      ).statusCode,
    ).toBe(400);
  });
  it('19C não membro lê público mas não interage; privado não é retornado anonimamente', async () => {
    const g = await group(),
      p = await post(g.id);
    expect((await call('GET', `/social/posts/${p.id}`)).statusCode).toBe(200);
    expect(
      (await call('POST', `/social/posts/${p.id}/like`, {}, bob)).statusCode,
    ).toBe(403);
    await edit(g.id, { privacyType: 'private' });
    for (const path of [
      `/groups/${g.id}/posts`,
      `/social/posts/${p.id}`,
      `/social/posts/${p.id}/comments`,
    ])
      expect((await call('GET', path)).statusCode).toBeGreaterThanOrEqual(400);
  });
  it('19D troca público/privado congela posts históricos e mídias, inclusive para autor removido', async () => {
    const g = await group(),
      m = await photo(),
      p = await post(g.id, alice, { mediaIds: [m.id] });
    await join(g.id);
    expect((await call('GET', `/social/media/${m.id}`)).statusCode).toBe(200);
    await edit(g.id, { privacyType: 'private' });
    expect((await call('GET', `/social/media/${m.id}`)).statusCode).toBe(404);
    await edit(g.id, { privacyType: 'public' });
    expect((await call('GET', `/social/posts/${p.id}`)).statusCode).toBe(404);
    const fresh = await post(g.id);
    expect((await call('GET', `/social/posts/${fresh.id}`)).statusCode).toBe(
      200,
    );
    await call(
      'POST',
      `/groups/${g.id}/transfer-ownership`,
      { userId: bob.id, confirm: true },
      alice,
    );
    await call('POST', `/groups/${g.id}/leave`, {}, alice);
    expect(
      (await call('GET', `/social/media/${m.id}`, undefined, alice)).statusCode,
    ).toBe(404);
  });
  it('19D remoção e banimento revogam post, foto, membros e convite', async () => {
    const g = await group({ privacyType: 'private' }),
      m = await photo(),
      p = await post(g.id, alice, { mediaIds: [m.id] });
    await join(g.id);
    await call(
      'POST',
      `/groups/${g.id}/join-requests/${bob.id}/approve`,
      {},
      alice,
    );
    const i = await invite(g.id);
    await call(
      'POST',
      `/groups/${g.id}/members/${bob.id}/ban`,
      { reason: 'Spam' },
      alice,
    );
    for (const path of [
      `/social/posts/${p.id}`,
      `/social/media/${m.id}`,
      `/groups/${g.id}/members`,
    ])
      expect((await call('GET', path, undefined, bob)).statusCode).toBe(404);
    expect((await accept(i)).statusCode).toBe(404);
    expect((await join(g.id)).statusCode).toBe(404);
    await call('DELETE', `/groups/${g.id}/members/${bob.id}/ban`, {}, alice);
    expect((await join(g.id)).statusCode).toBe(200);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, bob)).statusCode,
    ).toBe(404);
  });
  it('19D suspensão impede texto, edição, likes e comentários, expira por timestamp', async () => {
    const g = await group();
    await join(g.id);
    const p = await post(g.id, bob);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/members/${bob.id}/suspend`,
          {
            reason: 'Revisão',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    for (const [path, data, method] of [
      [`/groups/${g.id}/posts`, { text: 'x', visibility: 'public' }, 'POST'],
      [`/social/posts/${p.id}`, { text: 'x', visibility: 'public' }, 'PATCH'],
      [`/social/posts/${p.id}/like`, {}, 'POST'],
      [`/social/posts/${p.id}/comments`, { text: 'x' }, 'POST'],
    ] as const)
      expect((await call(method, path, data, bob)).statusCode).toBe(403);
    await pool.query(
      "UPDATE group_member_restrictions SET expires_at=now()-interval '1 second'",
    );
    expect(
      (await call('POST', `/social/posts/${p.id}/like`, {}, bob)).statusCode,
    ).toBe(200);
  });
  it('19D hierarquia de moderação impede remover proprietário e administrador', async () => {
    const g = await group();
    await join(g.id);
    await join(g.id, charlie);
    await call(
      'PATCH',
      `/groups/${g.id}/members/${bob.id}/role`,
      { role: 'moderator' },
      alice,
    );
    await call(
      'PATCH',
      `/groups/${g.id}/members/${charlie.id}/role`,
      { role: 'admin' },
      alice,
    );
    for (const target of [alice.id, charlie.id])
      expect(
        (
          await call(
            'POST',
            `/groups/${g.id}/members/${target}/ban`,
            { reason: 'x' },
            bob,
          )
        ).statusCode,
      ).toBe(403);
    await call(
      'PATCH',
      `/groups/${g.id}/members/${bob.id}/role`,
      { role: 'member' },
      alice,
    );
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/members/${charlie.id}/ban`,
          { reason: 'x' },
          bob,
        )
      ).statusCode,
    ).toBe(403);
  });
  it('19D bloqueio individual impede ler autor e convites entre bloqueados', async () => {
    const g = await group();
    await join(g.id);
    const p = await post(g.id, bob);
    await call('POST', `/social/blocks/${bob.id}`, {}, charlie);
    expect(
      (await call('GET', `/social/posts/${p.id}`, undefined, charlie))
        .statusCode,
    ).toBe(404);
    await call('POST', `/social/blocks/${bob.id}`, {}, alice);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/invitations`,
          {
            userId: bob.id,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          alice,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (await call('GET', `/groups/${g.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    await call('DELETE', `/social/blocks/${bob.id}`, {}, charlie);
    await call('DELETE', `/social/blocks/${bob.id}`, {}, alice);
    const privateGroup = await group({ privacyType: 'private' });
    await join(privateGroup.id, bob);
    await join(privateGroup.id, charlie);
    await call(
      'POST',
      `/groups/${privateGroup.id}/join-requests/${charlie.id}/approve`,
      {},
      alice,
    );
    await call(
      'PATCH',
      `/groups/${privateGroup.id}/members/${charlie.id}/role`,
      { role: 'admin' },
      alice,
    );
    await call('POST', `/social/blocks/${bob.id}`, {}, alice);
    expect(
      (
        await call(
          'POST',
          `/groups/${privateGroup.id}/join-requests/${bob.id}/approve`,
          {},
          charlie,
        )
      ).statusCode,
    ).toBe(404);
  });
  it('19D regras versionadas exigem nova aceitação sem expulsar e staff restringe publicação', async () => {
    const g = await group();
    await join(g.id);
    await edit(g.id, { rules: ['Nova regra'], postingPolicy: 'staff' });
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/posts`,
          { text: 'x', visibility: 'public' },
          bob,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/accept-rules`,
          { acceptRules: true, rulesVersion: 2 },
          bob,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/posts`,
          { text: 'x', visibility: 'public' },
          bob,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await pool.query(
          'SELECT * FROM group_rules_versions WHERE group_id=$1',
          [g.id],
        )
      ).rowCount,
    ).toBe(2);
  });
  it('19D moderação oculta sem editar texto e denúncias preservam identidade', async () => {
    const g = await group();
    await join(g.id);
    const p = await post(g.id, bob),
      c = await call(
        'POST',
        `/social/posts/${p.id}/comments`,
        { text: 'Comentário original' },
        bob,
      );
    await call(
      'PATCH',
      `/groups/${g.id}/members/${bob.id}/role`,
      { role: 'moderator' },
      alice,
    );
    expect(
      (
        await call(
          'POST',
          '/social/reports',
          { kind: 'group', id: g.id, reason: 'personal_data' },
          charlie,
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await call(
          'POST',
          '/social/reports',
          { kind: 'post', id: p.id, reason: 'spam' },
          charlie,
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/moderate/comments/${c.json().id}`,
          { reason: 'Revisão' },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/groups/${g.id}/moderate/posts/${p.id}`,
          { reason: 'Revisão' },
          alice,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query('SELECT text,status FROM social_posts WHERE id=$1', [
          p.id,
        ])
      ).rows[0],
    ).toEqual({ text: 'Texto restrito do grupo', status: 'restricted' });
    expect(
      (await call('GET', `/groups/${g.id}/audit`, undefined, charlie))
        .statusCode,
    ).toBe(403);
    expect(
      (await pool.query('SELECT escalation FROM social_reports')).rows.every(
        (r) => r.escalation === 'platform',
      ),
    ).toBe(true);
  });
  it('19D avatar/capa reutilizam upload, não vazam não listados e limpeza preserva associação', async () => {
    const g = await group({
        privacyType: 'private',
        discoveryMode: 'unlisted',
      }),
      m = await photo();
    expect(
      (await call('PATCH', `/groups/${g.id}/images`, { cover: m.id }, alice))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', `/social/media/${m.id}`, undefined, bob)).statusCode,
    ).toBe(404);
    await pool.query(
      "UPDATE social_post_media SET created_at=now()-interval '2 hours'",
    );
    await pool.query('UPDATE social_media_cleanup SET available_at=now()');
    await cleanupSocialMedia(pool, {
      put: async () => {},
      get: async () => Buffer.alloc(0),
      remove: async (k) => {
        files.delete(k);
      },
    });
    expect(
      (await call('GET', `/social/media/${m.id}`, undefined, alice)).statusCode,
    ).toBe(200);
    expect(
      (await call('DELETE', `/social/media/${m.id}`, {}, alice)).statusCode,
    ).toBe(404);
  });
  it('19D arquiva sem novas interações, restaura e exclui logicamente com auditoria preservada', async () => {
    const g = await group(),
      p = await post(g.id);
    await call('POST', `/groups/${g.id}/archive`, { confirm: true }, alice);
    expect((await join(g.id)).statusCode).toBe(409);
    expect((await call('GET', `/social/posts/${p.id}`)).statusCode).toBe(200);
    await call('POST', `/groups/${g.id}/restore`, { confirm: true }, alice);
    expect((await join(g.id)).statusCode).toBe(200);
    await call('DELETE', `/groups/${g.id}`, { confirm: true }, alice);
    expect((await call('GET', `/social/posts/${p.id}`)).statusCode).toBe(404);
    expect(
      (
        await pool.query(
          'SELECT * FROM group_moderation_actions WHERE group_id=$1',
          [g.id],
        )
      ).rowCount,
    ).toBeGreaterThan(3);
    expect(
      (await pool.query('SELECT * FROM social_posts WHERE id=$1', [p.id]))
        .rowCount,
    ).toBe(1);
  });
  it('19E perfil de terceiros omite participação privada e cabeçalhos impedem cache', async () => {
    const a = await group(),
      b = await group({ privacyType: 'private' });
    await join(a.id);
    await join(b.id);
    await call(
      'POST',
      `/groups/${b.id}/join-requests/${bob.id}/approve`,
      {},
      alice,
    );
    const r = await call(
      'GET',
      `/groups?profileId=${bob.id}`,
      undefined,
      charlie,
    );
    expect(r.json().items.map((g: { id: string }) => g.id)).toEqual([a.id]);
    expect(r.headers['cache-control']).toContain('no-store');
    expect(r.headers.vary).toContain('Cookie');
  });
  it('19E exige sessão e CSRF, limita flood de criação sem dados fictícios', async () => {
    expect((await call('POST', '/groups', body())).statusCode).toBe(401);
    expect(
      (
        await call('POST', '/groups', body(), alice, {
          'x-csrf-token': 'wrong',
        })
      ).statusCode,
    ).toBe(403);
    for (let n = 0; n < 5; n++) await group();
    expect((await call('POST', '/groups', body(), alice)).statusCode).toBe(429);
  });
});
