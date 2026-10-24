import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { csrfFor, digest, hashPassword } from '../src/modules/auth/security.js';
import { authenticator, encryptSecret } from '../src/modules/admin/mfa.js';
import { routeFixture, circuitFixture } from './route-fixtures.js';
const url = process.env.TEST_DATABASE_URL,
  schema = 'admin_test_' + randomUUID().replaceAll('-', ''),
  mfaKey = randomBytes(32).toString('hex'),
  password = 'Senha de testes com espaços 2026!';
let root: pg.Pool, pool: pg.Pool, app: FastifyInstance, hash: string;
const mediaFiles = new Map<string, Buffer>();
type Session = {
  id: string;
  session: string;
  cookie: string;
  csrf: string;
  secret: string;
};
let superadmin: Session,
  moderator: Session,
  reviewer: Session,
  integrity: Session,
  auditor: Session,
  platform: Session,
  alice: Session,
  bob: Session;
async function account(name: string, role?: string): Promise<Session> {
  const id = randomUUID(),
    raw = randomBytes(32).toString('base64url'),
    session = randomUUID(),
    secret = authenticator().secret.base32;
  await pool.query(
    "INSERT INTO users(id,display_name,username,email,password_hash,terms_version,privacy_version,email_verified_at) VALUES($1,$2,$2,$3,$4,'test','test',now())",
    [id, name, name + '@example.com', hash],
  );
  await pool.query('INSERT INTO profiles(id,user_id) VALUES($1,$2)', [
    randomUUID(),
    id,
  ]);
  await pool.query('INSERT INTO privacy_settings(user_id) VALUES($1)', [id]);
  await pool.query(
    "INSERT INTO user_sessions(id,user_id,secret_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
    [session, id, digest(raw)],
  );
  if (role) {
    await pool.query(
      'INSERT INTO admin_user_roles(id,user_id,role_code,granted_by) VALUES($1,$2,$3,$2)',
      [randomUUID(), id, role],
    );
    await pool.query(
      'INSERT INTO admin_mfa(user_id,encrypted_secret,confirmed_at) VALUES($1,$2,now())',
      [id, encryptSecret(secret, mfaKey, id)],
    );
    await pool.query(
      'INSERT INTO admin_sessions(session_id,user_id) VALUES($1,$2)',
      [session, id],
    );
  }
  return {
    id,
    session,
    cookie: 'apex_session=' + raw,
    csrf: csrfFor(raw),
    secret,
  };
}
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
      'x-apex-request': '1',
      origin: 'http://127.0.0.1:5173',
      ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}),
      ...headers,
    },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}
const reason = 'Regra de convivência: validação sintética do caso.';
async function post() {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO social_posts(id,author_id,text,visibility) VALUES($1,$2,'<img src=x onerror=alert(1)>','public')",
    [id, alice.id],
  );
  return id;
}
async function report(id: string, kind = 'post') {
  const r = await call(
    'POST',
    '/social/reports',
    {
      kind,
      id,
      reason: 'personal_data',
      detail: 'Exposição indevida reportada.',
    },
    bob,
  );
  expect(r.statusCode, r.body).toBe(201);
  return (
    await pool.query('SELECT id FROM moderation_cases WHERE target_id=$1', [id])
  ).rows[0].id as string;
}
async function assign(key: string) {
  const r = await call(
    'POST',
    `/admin/reports/${key}/assign`,
    { assignedTo: moderator.id, version: 1, reason },
    superadmin,
  );
  expect(r.statusCode, r.body).toBe(200);
}
async function sanction(scope = 'posts', expiry?: string) {
  return call(
    'POST',
    `/admin/users/${alice.id}/${scope === 'account' ? 'suspend' : 'restrict'}`,
    {
      reason,
      policyCode: 'conduct-v1',
      scope,
      ...(scope === 'account' ? { confirm: 'SUSPENDER' } : {}),
      expiresAt: expiry ?? new Date(Date.now() + 86400000).toISOString(),
      operationId: randomUUID(),
    },
    superadmin,
  );
}
describe.skipIf(!url)('Parte 22 — PostgreSQL/PostGIS e APIs reais', () => {
  beforeAll(async () => {
    const config = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      DATABASE_SSL: process.env.DATABASE_SSL ?? 'disable',
      ADMIN_MFA_KEY: mfaKey,
    });
    const opts = {
      connectionString: config.databaseUrl,
      ssl:
        config.databaseSsl === 'verify-full'
          ? { rejectUnauthorized: true }
          : false,
    };
    root = new pg.Pool(opts);
    await root.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ ...opts, options: `-c search_path=${schema},public` });
    await migrate(pool);
    hash = await hashPassword(password);
    app = await buildApp({
      config,
      logger: false,
      database: { pool, check: async () => {}, close: async () => {} },
      socialStorage: {
        put: async (k, b) => {
          mediaFiles.set(k, b);
        },
        get: async (k) => {
          const b = mediaFiles.get(k);
          if (!b) throw new Error('Missing test media');
          return b;
        },
        remove: async (k) => {
          mediaFiles.delete(k);
        },
      },
    });
    await app.ready();
  }, 20000);
  beforeEach(async () => {
    mediaFiles.clear();
    await pool.query(
      'ALTER TABLE admin_audit_logs DISABLE TRIGGER admin_audit_no_truncate',
    );
    await pool.query('TRUNCATE users,auth_rate_limits CASCADE');
    await pool.query(
      'ALTER TABLE admin_audit_logs ENABLE TRIGGER admin_audit_no_truncate',
    );
    await pool.query(
      'INSERT INTO admin_settings_versions(settings,reason) VALUES(\'{"reportNotice":"Orientação de teste"}\',\'test_reset\')',
    );
    superadmin = await account('root_admin', 'superadmin');
    moderator = await account('moderator', 'moderator');
    reviewer = await account('reviewer', 'route_reviewer');
    integrity = await account('integrity', 'integrity');
    auditor = await account('auditor', 'auditor');
    platform = await account('platform', 'platform');
    alice = await account('alice');
    bob = await account('bob');
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (root) {
      await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await root.end();
    }
  });
  it('22A nega anônimo, usuário comum, papel forjado e rota legada', async () => {
    expect((await call('GET', '/admin/dashboard')).statusCode).toBe(401);
    expect(
      (await call('GET', '/admin/dashboard', undefined, alice)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/admin/users/${bob.id}/suspend`,
          { role: 'superadmin', isAdmin: true },
          alice,
        )
      ).statusCode,
    ).toBe(403);
    await pool.query('INSERT INTO route_moderators(user_id) VALUES($1)', [
      alice.id,
    ]);
    expect(
      (await call('GET', '/admin/routes', undefined, alice)).statusCode,
    ).toBe(403);
    await pool.query(
      "INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,120,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET attempts=120,expires_at=excluded.expires_at",
      [digest('admin:' + alice.id)],
    );
    expect(
      (await call('GET', '/admin/dashboard', undefined, alice)).statusCode,
    ).toBe(429);
  });
  it.each([
    ['moderator', '/admin/operators'],
    ['reviewer', '/admin/gamification/anomalies'],
    ['integrity', '/admin/users'],
    ['auditor', '/admin/reports'],
    ['platform', '/admin/audit'],
  ] as const)('22A matriz negativa %s → %s', async (role, path) => {
    const s = { moderator, reviewer, integrity, auditor, platform }[role];
    expect((await call('GET', path, undefined, s)).statusCode).toBe(403);
  });
  it.each([
    'superadmin',
    'moderator',
    'reviewer',
    'integrity',
    'auditor',
    'platform',
  ] as const)('22A dashboard autorizado %s e sem cache', async (role) => {
    const s = { superadmin, moderator, reviewer, integrity, auditor, platform }[
        role
      ],
      r = await call('GET', '/admin/dashboard', undefined, s);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['cache-control']).toContain('no-store');
    expect(r.json().metrics.users).toBe(8);
    expect(
      r
        .json()
        .registrationsByDay.reduce(
          (sum: number, day: { count: number }) => sum + day.count,
          0,
        ),
    ).toBe(8);
    expect(r.body).not.toMatch(/password|longitude|latitude|secret_hash/);
  });
  it('22A MFA pendente, sessão expirada e revogação imediata', async () => {
    await pool.query('DELETE FROM admin_sessions WHERE user_id=$1', [
      moderator.id,
    ]);
    expect(
      (await call('GET', '/admin/dashboard', undefined, moderator)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          '/admin/mfa/verify',
          { password, code: authenticator(moderator.secret).generate() },
          moderator,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/admin/mfa/verify',
          { password, code: authenticator(moderator.secret).generate() },
          moderator,
        )
      ).statusCode,
    ).toBe(403);
    await pool.query(
      'UPDATE admin_user_roles SET revoked_at=now() WHERE user_id=$1',
      [moderator.id],
    );
    expect(
      (await call('GET', '/admin/dashboard', undefined, moderator)).statusCode,
    ).toBe(403);
    await pool.query(
      "UPDATE user_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
      [superadmin.id],
    );
    expect(
      (await call('GET', '/admin/dashboard', undefined, superadmin)).statusCode,
    ).toBe(401);
  });
  it('22A inscrição TOTP cifrada, recuperação de uso único e força bruta', async () => {
    await pool.query('DELETE FROM admin_mfa WHERE user_id=$1', [moderator.id]);
    const setup = await call(
      'POST',
      '/admin/mfa/enroll',
      { password },
      moderator,
    );
    expect(setup.statusCode, setup.body).toBe(200);
    const secret = setup.json().secret;
    expect(
      (
        await pool.query(
          'SELECT encrypted_secret FROM admin_mfa WHERE user_id=$1',
          [moderator.id],
        )
      ).rows[0].encrypted_secret,
    ).not.toContain(secret);
    const verify = await call(
      'POST',
      '/admin/mfa/verify',
      { password, code: authenticator(secret).generate() },
      moderator,
    );
    expect(verify.statusCode, verify.body).toBe(200);
    const code = verify.json().recoveryCodes[0];
    expect(
      (
        await call(
          'POST',
          '/admin/mfa/verify',
          { password, recoveryCode: code },
          moderator,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/admin/mfa/verify',
          { password, recoveryCode: code },
          moderator,
        )
      ).statusCode,
    ).toBe(403);
    await call(
      'POST',
      '/admin/mfa/verify',
      { password, code: '000000' },
      moderator,
    );
    expect(
      (
        await call(
          'POST',
          '/admin/mfa/verify',
          { password, code: '000000' },
          moderator,
        )
      ).statusCode,
    ).toBe(429);
  });
  it('22A CSRF, origem, reautenticação recente e mass assignment', async () => {
    expect(
      (
        await call('POST', '/admin/logout', {}, superadmin, {
          'x-csrf-token': 'wrong',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call('POST', '/admin/logout', {}, superadmin, {
          origin: 'https://evil.example',
        })
      ).statusCode,
    ).toBe(403);
    await pool.query(
      "UPDATE admin_sessions SET verified_at=now()-interval '6 minutes' WHERE user_id=$1",
      [superadmin.id],
    );
    expect((await sanction()).statusCode).toBe(200);
    expect((await sanction('account')).statusCode).toBe(403);
    await pool.query(
      'UPDATE admin_sessions SET verified_at=now() WHERE user_id=$1',
      [superadmin.id],
    );
    expect(
      (
        await call(
          'POST',
          '/admin/operators/' + bob.id + '/roles',
          {
            role: 'moderator',
            action: 'grant',
            reason,
            isAdmin: true,
            operationId: randomUUID(),
          },
          superadmin,
        )
      ).statusCode,
    ).toBe(400);
  });
  it('22B denúncia duplicada, inválida e caso não atribuído', async () => {
    const id = await post(),
      key = await report(id);
    expect(
      (
        await call(
          'POST',
          '/social/reports',
          { kind: 'post', id, reason: 'spam' },
          bob,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          '/social/reports',
          { kind: 'post', id: 'bad', reason: 'spam' },
          bob,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await call('GET', `/admin/reports/${key}`, undefined, moderator))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('GET', '/social/posts/' + id, undefined, alice)).statusCode,
    ).toBe(200);
  });
  it('22B decisão concorrente, idempotência, ocultação, restauração e denunciante protegido', async () => {
    const id = await post(),
      key = await report(id);
    await assign(key);
    const evidence = await call(
      'GET',
      `/admin/reports/${key}`,
      undefined,
      moderator,
    );
    expect(evidence.statusCode).toBe(200);
    expect(evidence.body).not.toContain(bob.id);
    expect(evidence.json().evidence.text).toContain('<img');
    const payload = {
      action: 'hide',
      reasonCode: 'privacy',
      explanation: reason,
      version: 2,
      operationId: randomUUID(),
    };
    const results = await Promise.all([
      call('POST', `/admin/reports/${key}/resolve`, payload, moderator),
      call(
        'POST',
        `/admin/reports/${key}/resolve`,
        { ...payload, action: 'dismiss', operationId: randomUUID() },
        moderator,
      ),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      (await call('POST', `/admin/reports/${key}/resolve`, payload, moderator))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/social/posts/' + id, undefined, alice)).statusCode,
    ).toBe(404);
    expect(
      (
        await pool.query(
          'SELECT * FROM moderation_decisions WHERE case_id=$1',
          [key],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await call(
          'PATCH',
          '/social/posts/' + id,
          { text: 'Novo texto', visibility: 'public', mediaIds: [] },
          alice,
        )
      ).statusCode,
    ).not.toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/reports/${key}/reopen`,
          { version: 3, reason },
          moderator,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/reports/${key}/resolve`,
          {
            ...payload,
            version: 4,
            action: 'restore',
            operationId: randomUUID(),
          },
          moderator,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/social/posts/' + id, undefined, alice)).statusCode,
    ).toBe(200);
  });
  it('22C advertência, restrições em APIs antigas e expiração pelo servidor', async () => {
    expect(
      (
        await call(
          'POST',
          `/admin/users/${alice.id}/warn`,
          { reason, policyCode: 'conduct', operationId: randomUUID() },
          superadmin,
        )
      ).statusCode,
    ).toBe(200);
    expect((await sanction()).statusCode).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          {
            text: 'texto',
            visibility: 'public',
            mediaIds: [],
          },
          alice,
        )
      ).statusCode,
    ).toBe(403);
    await pool.query(
      "UPDATE moderation_sanctions SET begins_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE user_id=$1 AND scope='posts'",
      [alice.id],
    );
    expect(
      (
        await call(
          'POST',
          '/social/posts',
          {
            text: 'texto',
            visibility: 'public',
            mediaIds: [],
          },
          alice,
        )
      ).statusCode,
    ).toBe(201);
  });
  it('22C suspensão revoga sessões sem excluir conteúdo e permite recurso após novo login', async () => {
    const id = await post();
    expect((await sanction('account')).statusCode).toBe(200);
    expect(
      (
        await call('GET', `/admin/users/${alice.id}`, undefined, superadmin)
      ).json().user.effective_status,
    ).toBe('suspended_temporarily');
    expect((await call('GET', '/users/me', undefined, alice)).statusCode).toBe(
      401,
    );
    expect(
      (await pool.query('SELECT id FROM social_posts WHERE id=$1', [id]))
        .rowCount,
    ).toBe(1);
    const login = await call('POST', '/auth/login', {
      email: 'alice@example.com',
      password,
    });
    expect(login.statusCode).toBe(200);
    const s = {
      ...alice,
      cookie: String(login.headers['set-cookie']).split(';')[0]!,
      csrf: login.json().csrfToken,
    };
    const mine = await call('GET', '/moderation/me', undefined, s);
    expect(mine.statusCode, mine.body).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/moderation/appeals',
          { sanctionId: mine.json().sanctions[0].id, explanation: reason },
          s,
        )
      ).statusCode,
    ).toBe(200);
    expect((await call('POST', '/social/posts', {}, s)).statusCode).toBe(403);
  });
  it('22C não permite suspensão de operadores e limita escopo do moderador', async () => {
    expect(
      (
        await call(
          'POST',
          `/admin/users/${superadmin.id}/restrict`,
          {
            reason,
            policyCode: 'test',
            scope: 'posts',
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            operationId: randomUUID(),
          },
          moderator,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/admin/users/${alice.id}/restrict`,
          {
            reason,
            policyCode: 'test',
            scope: 'posts',
            expiresAt: new Date(Date.now() + 10000).toISOString(),
            operationId: randomUUID(),
          },
          moderator,
        )
      ).statusCode,
    ).toBe(403);
  });
  it('22C cancelamento de evento elimina posição e revoga consentimento sem devolver coordenadas', async () => {
    const id = randomUUID(),
      session = randomUUID();
    await pool.query(
      "INSERT INTO social_events(id,organizer_id,creation_key,title,event_type,visibility,join_policy,city,state,meeting_point,meeting_point_label,starts_at,ends_at,timezone) VALUES($1,$2,$3,'Evento de teste','meetup','public','immediate','Maceió','AL',public.ST_SetSRID(public.ST_MakePoint(-35.7,-9.6),4326),'Praça',now()-interval '1 hour',now()+interval '1 hour','America/Maceio')",
      [id, alice.id, randomUUID()],
    );
    await pool.query(
      "INSERT INTO live_location_sessions(id,event_id,user_id,audience_scope,precision_mode,consent_version,expires_at) VALUES($1,$2,$3,'confirmed','precise','live-v1',now()+interval '30 minutes')",
      [session, id, alice.id],
    );
    await pool.query(
      "INSERT INTO live_location_positions(session_id,event_id,user_id,longitude,latitude,accuracy,recorded_at,expires_at) VALUES($1,$2,$3,-35.7,-9.6,5,now(),now()+interval '30 seconds')",
      [session, id, alice.id],
    );
    const r = await call(
      'POST',
      `/admin/events/${id}/decision`,
      { action: 'cancel', reason, confirm: 'CONFIRMAR' },
      superadmin,
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.body).not.toMatch(/longitude|latitude/);
    expect(
      (
        await pool.query(
          'SELECT revoked_at FROM live_location_sessions WHERE id=$1',
          [session],
        )
      ).rows[0].revoked_at,
    ).toBeTruthy();
    expect(
      (
        await pool.query(
          'SELECT 1 FROM live_location_positions WHERE event_id=$1',
          [id],
        )
      ).rowCount,
    ).toBe(0);
  });
  it('22C rota privada não exposta, publicação e verificação separadas, evidência obrigatória', async () => {
    const route = (await call('POST', '/routes', routeFixture(), alice)).json()
      .route.id;
    expect(
      (await call('GET', `/admin/routes/${route}/review`, undefined, reviewer))
        .statusCode,
    ).toBe(404);
    const id = (await call('POST', '/circuits', circuitFixture(), alice)).json()
      .route.id;
    await call('POST', `/routes/${id}/submit`, {}, alice);
    expect(
      (
        await call(
          'POST',
          `/admin/routes/${id}/decisions`,
          { action: 'approve', reason, version: 1 },
          reviewer,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/routes/${id}/decisions`,
          { action: 'verify', reason, version: 1, closedVenue: true },
          reviewer,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          `/admin/routes/${id}/decisions`,
          {
            action: 'verify',
            reason,
            version: 1,
            closedVenue: true,
            evidence:
              'Documento sintético de instalação fechada autorizada; linha e sentido revisados.',
          },
          reviewer,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/circuits/${id}/suspend-verification`,
          { reason, version: 1 },
          reviewer,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await pool.query('SELECT verification FROM routes WHERE id=$1', [id]))
        .rows[0].verification,
    ).toBe('suggested');
  });
  it('22D compensação de XP, aprovação independente e projeção sem reconcessão', async () => {
    const ledger = (
      await pool.query(
        "INSERT INTO xp_ledger(user_id,rule_code,rule_version,source_type,source_id,occurrence_key,generation,xp_delta,status,reason,effective_at) VALUES($1,'ride',1,'ride','synthetic','ride:synthetic',1,20,'granted','test',now()) RETURNING id",
        [alice.id],
      )
    ).rows[0].id;
    const request = await call(
      'POST',
      '/admin/gamification/adjustments/request',
      { ledgerId: ledger, reason, operationId: randomUUID() },
      integrity,
    );
    expect(request.statusCode, request.body).toBe(200);
    const id = request.json().id;
    expect(
      (
        await call(
          'POST',
          `/admin/approvals/${id}/review`,
          { decision: 'approve', reason, confirm: 'CONFIRMAR' },
          integrity,
        )
      ).statusCode,
    ).toBe(403);
    const approved = await call(
      'POST',
      `/admin/approvals/${id}/review`,
      { decision: 'approve', reason, confirm: 'CONFIRMAR' },
      superadmin,
    );
    expect(approved.statusCode, approved.body).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/approvals/${id}/review`,
          { decision: 'approve', reason, confirm: 'CONFIRMAR' },
          superadmin,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await pool.query(
          'SELECT sum(xp_delta)::int AS xp FROM xp_ledger WHERE user_id=$1',
          [alice.id],
        )
      ).rows[0].xp,
    ).toBe(0);
    expect(
      (
        await pool.query('SELECT * FROM admin_xp_exclusions WHERE user_id=$1', [
          alice.id,
        ])
      ).rowCount,
    ).toBe(1);
  });
  it('22E concessão crítica, autoelevação negada, aprovação única e papel revogado', async () => {
    expect(
      (
        await call(
          'POST',
          `/admin/operators/${superadmin.id}/roles`,
          {
            role: 'auditor',
            action: 'grant',
            reason,
            operationId: randomUUID(),
          },
          superadmin,
        )
      ).statusCode,
    ).toBe(403);
    const request = await call(
      'POST',
      `/admin/operators/${bob.id}/roles`,
      {
        role: 'superadmin',
        action: 'grant',
        reason,
        operationId: randomUUID(),
      },
      superadmin,
    );
    expect(request.statusCode, request.body).toBe(200);
    const id = request.json().id;
    expect(
      (
        await call(
          'POST',
          `/admin/approvals/${id}/review`,
          { decision: 'approve', reason, confirm: 'CONFIRMAR' },
          auditor,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/admin/dashboard', undefined, bob)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/admin/operators/${moderator.id}/roles`,
          {
            role: 'moderator',
            action: 'revoke',
            reason,
            operationId: randomUUID(),
          },
          superadmin,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/admin/dashboard', undefined, moderator)).statusCode,
    ).toBe(403);
  });
  it('22E auditoria sem segredos, append-only, acesso específico e rollback de falha', async () => {
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () =>
        call('GET', '/admin/users', undefined, superadmin),
      ),
    );
    expect(concurrent.some((r) => r.statusCode === 429)).toBe(true);
    expect((await call('GET', '/health')).statusCode).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS failures FROM (SELECT previous_hash,lag(entry_hash,1,'') OVER(ORDER BY id) AS expected FROM admin_audit_logs) a WHERE previous_hash<>expected",
        )
      ).rows[0].failures,
    ).toBe(0);
    await call('GET', '/admin/users', undefined, superadmin);
    const r = await call('GET', '/admin/audit', undefined, auditor);
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(
      /password_hash|encrypted_secret|longitude|latitude/,
    );
    expect(r.json().items[0].entry_hash).toHaveLength(64);
    await expect(
      pool.query("UPDATE admin_audit_logs SET action='tampered'"),
    ).rejects.toThrow();
    await expect(pool.query('DELETE FROM admin_audit_logs')).rejects.toThrow();
    await expect(pool.query('TRUNCATE admin_audit_logs')).rejects.toThrow();
    await pool.query(
      "CREATE FUNCTION fail_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='user_restrict' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_admin_audit BEFORE INSERT ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_admin_audit()",
    );
    try {
      expect((await sanction()).statusCode).toBe(500);
      expect(
        (
          await pool.query(
            'SELECT 1 FROM moderation_sanctions WHERE user_id=$1',
            [alice.id],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await pool.query(
        'DROP TRIGGER fail_admin_audit ON admin_audit_logs; DROP FUNCTION fail_admin_audit()',
      );
    }
  });
  it('22E privacidade exige identidade, transição válida e titularidade', async () => {
    const req = await call(
      'POST',
      '/privacy/requests',
      { kind: 'export', explanation: reason, operationId: randomUUID() },
      alice,
    );
    expect(req.statusCode).toBe(200);
    const key = req.json().id;
    expect(
      (await call('GET', '/privacy/requests', undefined, bob)).json().items,
    ).toHaveLength(0);
    expect(
      (
        await call(
          'POST',
          `/admin/privacy/${key}/decision`,
          { status: 'completed', resolution: reason, version: 1 },
          superadmin,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          `/admin/privacy/${key}/decision`,
          { status: 'verifying', resolution: reason, version: 1 },
          superadmin,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/privacy/${key}/decision`,
          { status: 'processing', resolution: reason, version: 2 },
          superadmin,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          `/admin/privacy/${key}/decision`,
          {
            status: 'processing',
            resolution: reason,
            identityVerified: true,
            version: 2,
          },
          superadmin,
        )
      ).statusCode,
    ).toBe(200);
  });
  it('22F limites, paginação determinística e minimização com 3000 contas', async () => {
    await pool.query(
      "INSERT INTO users(id,display_name,username,email,password_hash,terms_version,privacy_version) SELECT md5('fixture-'||n)::uuid,'Sintético '||n,'synthetic_'||n,'synthetic_'||n||'@example.com','disabled','test','test' FROM generate_series(1,3000) n",
    );
    const at = performance.now(),
      r = await call('GET', '/admin/users?page=1', undefined, superadmin);
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toHaveLength(30);
    expect(r.json().hasMore).toBe(true);
    expect(performance.now() - at).toBeLessThan(3000);
    expect(r.body).not.toContain('password_hash');
    const second = await call(
      'GET',
      '/admin/users?page=2',
      undefined,
      superadmin,
    );
    expect(
      second
        .json()
        .items.map((x: { id: string }) => x.id)
        .some((x: string) =>
          r.json().items.some((y: { id: string }) => y.id === x),
        ),
    ).toBe(false);
    expect(
      (await call('GET', '/admin/users?page=1000000', undefined, superadmin))
        .statusCode,
    ).toBe(400);
  });
  it('22B grupo privado: evidência delimitada sem acesso global e restrição de posts no endpoint de grupo', async () => {
    const created = await call(
      'POST',
      '/groups',
      {
        creationKey: randomUUID(),
        name: 'Grupo privado de teste',
        description: 'Contexto protegido',
        privacyType: 'private',
        discoveryMode: 'listed',
        joinPolicy: 'approval',
        postingPolicy: 'members',
        membersCanInvite: false,
        city: 'Maceió',
        state: 'AL',
        categories: [],
        rules: [],
      },
      alice,
    );
    expect(created.statusCode, created.body).toBe(201);
    const group = created.json().group.id;
    await pool.query(
      "INSERT INTO group_memberships(group_id,user_id,status,accepted_rules_version) VALUES($1,$2,'active',1)",
      [group, bob.id],
    );
    const published = await call(
      'POST',
      `/groups/${group}/posts`,
      { text: 'Evidência privada mínima', visibility: 'public' },
      alice,
    );
    expect(published.statusCode, published.body).toBe(201);
    const id = published.json().post.id,
      key = await report(id);
    await assign(key);
    expect(
      (await call('GET', `/groups/${group}/posts`, undefined, moderator))
        .statusCode,
    ).not.toBe(200);
    const evidence = await call(
      'GET',
      `/admin/reports/${key}`,
      undefined,
      moderator,
    );
    expect(evidence.json().evidence.text).toBe('Evidência privada mínima');
    expect(evidence.body).not.toContain('Contexto protegido');
    expect((await sanction()).statusCode).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/groups/${group}/posts`,
          { text: 'Tentativa por endpoint antigo', visibility: 'public' },
          alice,
        )
      ).statusCode,
    ).toBe(403);
  });
  it('22B recurso exige proprietário e revisor independente; reversão restaura publicação', async () => {
    const id = await post(),
      key = await report(id);
    await assign(key);
    const hidden = await call(
      'POST',
      `/admin/reports/${key}/resolve`,
      {
        action: 'hide',
        reasonCode: 'privacy',
        explanation: reason,
        version: 2,
        operationId: randomUUID(),
      },
      moderator,
    );
    expect(hidden.statusCode).toBe(200);
    const decision = (
      await pool.query('SELECT id FROM moderation_decisions WHERE case_id=$1', [
        key,
      ])
    ).rows[0].id;
    expect(
      (
        await call(
          'POST',
          '/moderation/appeals',
          { decisionId: decision, explanation: reason },
          bob,
        )
      ).statusCode,
    ).toBe(404);
    const appeal = await call(
      'POST',
      '/moderation/appeals',
      { decisionId: decision, explanation: reason },
      alice,
    );
    expect(appeal.statusCode).toBe(200);
    const idAppeal = appeal.json().id;
    expect(
      (
        await call(
          'POST',
          `/admin/appeals/${idAppeal}/resolve`,
          { decision: 'overturned', reason },
          moderator,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/admin/appeals/${idAppeal}/resolve`,
          { decision: 'overturned', reason },
          platform,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/social/posts/' + id, undefined, alice)).statusCode,
    ).toBe(200);
  });
  it('22E não remove último superadministrador efetivo e aprovação expira', async () => {
    await pool.query(
      "INSERT INTO admin_role_permissions VALUES('auditor','admin.roles.manage'),('platform','admin.roles.approve')",
    );
    try {
      const request = await call(
        'POST',
        `/admin/operators/${superadmin.id}/roles`,
        {
          role: 'superadmin',
          action: 'revoke',
          reason,
          operationId: randomUUID(),
        },
        auditor,
      );
      expect(request.statusCode, request.body).toBe(200);
      const key = request.json().id;
      expect(
        (
          await call(
            'POST',
            `/admin/approvals/${key}/review`,
            { decision: 'approve', reason, confirm: 'CONFIRMAR' },
            platform,
          )
        ).statusCode,
      ).toBe(409);
      await pool.query(
        "UPDATE admin_action_approvals SET expires_at=now()-interval '1 second' WHERE id=$1",
        [key],
      );
      expect(
        (
          await call(
            'POST',
            `/admin/approvals/${key}/review`,
            { decision: 'reject', reason, confirm: 'CONFIRMAR' },
            platform,
          )
        ).statusCode,
      ).toBe(409);
    } finally {
      await pool.query(
        "DELETE FROM admin_role_permissions WHERE (role_code='auditor' AND permission_code='admin.roles.manage') OR (role_code='platform' AND permission_code='admin.roles.approve')",
      );
    }
  });
  it('22E incidentes e configurações exigem versão e mantêm histórico', async () => {
    const incident = await call(
      'POST',
      '/admin/security/incidents',
      { category: 'access_misuse', severity: 'high', description: reason },
      superadmin,
    );
    expect(incident.statusCode).toBe(200);
    const key = incident.json().id;
    expect(
      (
        await call(
          'POST',
          `/admin/security/incidents/${key}/decision`,
          { status: 'closed', containment: reason, version: 1 },
          superadmin,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          `/admin/security/incidents/${key}/decision`,
          { status: 'analysis', containment: reason, version: 1 },
          superadmin,
        )
      ).statusCode,
    ).toBe(200);
    const settings = await call(
        'GET',
        '/admin/settings',
        undefined,
        superadmin,
      ),
      version = Number(settings.json().items[0].id);
    expect(
      (
        await call(
          'POST',
          '/admin/settings',
          {
            reportNotice: 'Consulte o suporte para orientação de privacidade.',
            reason,
            version,
          },
          superadmin,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/admin/settings',
          {
            reportNotice: 'Consulte o suporte para orientação de privacidade.',
            reason,
            version,
          },
          superadmin,
        )
      ).statusCode,
    ).toBe(409);
  });
  it('22D entrada de ranking mantém opt-in e correções fechadas incrementam revisão', async () => {
    await pool.query(
      "INSERT INTO leaderboard_seasons(id,name,starts_at,ends_at,status) VALUES('2026-09','Teste fechado',now()-interval '60 days',now()-interval '30 days','closed') ON CONFLICT DO NOTHING",
    );
    await pool.query(
      'INSERT INTO leaderboard_participation(user_id,opted_in) VALUES($1,true)',
      [alice.id],
    );
    await pool.query(
      "INSERT INTO leaderboard_scores(season_id,user_id,category,displacement_band,kind,score) VALUES('2026-09',$1,'Naked','unknown','xp',20)",
      [alice.id],
    );
    const request = await call(
      'POST',
      `/admin/rankings/entries/${alice.id}/decision`,
      { season: '2026-09', action: 'suspend', reason },
      integrity,
    );
    expect(request.statusCode, request.body).toBe(200);
    expect(
      (
        await call(
          'GET',
          '/admin/rankings/entries?season=2026-09',
          undefined,
          integrity,
        )
      ).json().items[0].suspended,
    ).toBe(true);
    expect(
      (
        await pool.query(
          'SELECT opted_in FROM leaderboard_participation WHERE user_id=$1',
          [alice.id],
        )
      ).rows[0].opted_in,
    ).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT revision FROM leaderboard_seasons WHERE id='2026-09'",
        )
      ).rows[0].revision,
    ).toBe(2);
    const own = await call('GET', '/moderation/me', undefined, alice);
    expect(own.json().decisions[0].action).toBe('ranking_suspended');
  });
  it('22D revisão de anomalia e recurso de conquista não fabricam pontos', async () => {
    const anomaly = (
      await pool.query(
        "INSERT INTO gamification_reviews(user_id,source_type,source_id,reason) VALUES($1,'ride','synthetic','Qualidade pendente') RETURNING id",
        [alice.id],
      )
    ).rows[0].id;
    expect(
      (
        await call(
          'POST',
          `/admin/gamification/anomalies/${anomaly}/review`,
          { status: 'rejected', reason },
          integrity,
        )
      ).statusCode,
    ).toBe(200);
    await pool.query(
      "INSERT INTO user_achievements(user_id,achievement_code,current_value,status,awarded_version) VALUES($1,'first_bike',1,'unlocked',1)",
      [alice.id],
    );
    expect(
      (
        await call(
          'POST',
          `/admin/gamification/users/${alice.id}/achievements`,
          { code: 'first_bike', action: 'revoke', reason },
          integrity,
        )
      ).statusCode,
    ).toBe(200);
    const decision = (
      await call('GET', '/moderation/me', undefined, alice)
    ).json().decisions[0].id;
    const appeal = await call(
      'POST',
      '/moderation/appeals',
      { decisionId: decision, explanation: reason },
      alice,
    );
    expect(appeal.statusCode).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/appeals/${appeal.json().id}/resolve`,
          { decision: 'overturned', reason },
          superadmin,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          'SELECT * FROM admin_achievement_states WHERE user_id=$1',
          [alice.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await pool.query('SELECT * FROM xp_ledger WHERE user_id=$1', [alice.id]))
        .rowCount,
    ).toBe(0);
    await call(
      'POST',
      `/admin/gamification/users/${alice.id}/achievements`,
      { code: 'first_bike', action: 'revoke', reason },
      integrity,
    );
    const older = (await call('GET', '/moderation/me', undefined, alice)).json()
      .decisions[0].id;
    const pending = await call(
      'POST',
      '/moderation/appeals',
      { decisionId: older, explanation: reason },
      alice,
    );
    await call(
      'POST',
      `/admin/gamification/users/${alice.id}/achievements`,
      {
        code: 'first_bike',
        action: 'revoke',
        reason: 'Outra revisão independente com fundamento posterior.',
      },
      superadmin,
    );
    expect(
      (
        await call(
          'POST',
          `/admin/appeals/${pending.json().id}/resolve`,
          { decision: 'overturned', reason },
          platform,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await pool.query(
          'SELECT 1 FROM admin_achievement_states WHERE user_id=$1',
          [alice.id],
        )
      ).rowCount,
    ).toBe(1);
  });
  it('22B fotografia: evidência delimitada, mídia antiga revogada e restauração', async () => {
    const bytes = await sharp({
      create: { width: 24, height: 24, channels: 3, background: '#bc1327' },
    })
      .png()
      .toBuffer();
    const uploaded = await call('POST', '/social/media', bytes, alice, {
      'content-type': 'image/png',
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const media = uploaded.json().media.id;
    const published = await call(
      'POST',
      '/social/posts',
      { text: 'Foto de teste', visibility: 'public', mediaIds: [media] },
      alice,
    );
    expect(published.statusCode, published.body).toBe(201);
    const key = await report(media, 'photo');
    await assign(key);
    expect(
      (
        await call(
          'GET',
          `/admin/reports/${key}/media/${media}`,
          undefined,
          bob,
        )
      ).statusCode,
    ).toBe(403);
    const evidence = await call(
      'GET',
      `/admin/reports/${key}/media/${media}`,
      undefined,
      moderator,
    );
    expect(evidence.statusCode, evidence.body).toBe(200);
    expect(evidence.headers['content-type']).toContain('image/webp');
    expect(
      (
        await call(
          'GET',
          `/admin/reports/${key}/media/${randomUUID()}`,
          undefined,
          moderator,
        )
      ).statusCode,
    ).toBe(404);
    const body = {
      action: 'hide',
      reasonCode: 'image_policy',
      explanation: reason,
      version: 2,
      operationId: randomUUID(),
    };
    expect(
      (await call('POST', `/admin/reports/${key}/resolve`, body, moderator))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/social/media/' + media, undefined, alice))
        .statusCode,
    ).toBe(404);
    await call(
      'POST',
      `/admin/reports/${key}/reopen`,
      { reason, version: 3 },
      moderator,
    );
    expect(
      (
        await call(
          'POST',
          `/admin/reports/${key}/resolve`,
          { ...body, action: 'restore', version: 4, operationId: randomUUID() },
          moderator,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/social/media/' + media, undefined, alice))
        .statusCode,
    ).toBe(200);
  });
  it('22E nenhum papel abre histórico GPS privado, garagem privada ou vídeos locais', async () => {
    const bike = await call(
      'POST',
      '/motorcycles',
      { brand: 'Honda', model: 'CB 650R', year: 2024, displacementCc: 649 },
      alice,
    );
    expect(bike.statusCode, bike.body).toBe(201);
    const start = Date.now() - 180000,
      body = {
        clientId: randomUUID(),
        motorcycleId: bike.json().motorcycle.id,
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
      };
    const saved = await call('POST', '/rides', body, alice);
    expect(saved.statusCode, saved.body).toBe(201);
    const id = saved.json().id;
    await pool.query(
      "UPDATE privacy_settings SET profile_visibility='private' WHERE user_id=$1",
      [alice.id],
    );
    for (const op of [
      superadmin,
      platform,
      moderator,
      reviewer,
      integrity,
      auditor,
    ]) {
      expect(
        (await call('GET', `/rides/${id}?view=summary`, undefined, op))
          .statusCode,
      ).toBe(404);
      expect(
        (await call('GET', `/rides/${id}/replay`, undefined, op)).statusCode,
      ).toBe(404);
      expect(
        (
          await call(
            'GET',
            `/motorcycles/${bike.json().motorcycle.id}`,
            undefined,
            op,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (await call('GET', `/admin/users/${alice.id}/gps`, undefined, op))
          .statusCode,
      ).toBe(404);
    }
    expect(
      (await call('GET', '/admin/videos', undefined, superadmin)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/admin/users/export', undefined, superadmin))
        .statusCode,
    ).toBe(400);
  });
});
