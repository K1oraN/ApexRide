import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { TestMailer } from '../src/modules/auth/mail.js';
import { digest, verifyPassword } from '../src/modules/auth/security.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
const secretPassword = 'minha frase de senha muito longa';
const newPassword = 'uma nova frase de senha segura';
const origin = 'http://127.0.0.1:5173';
const payload = {
  displayName: 'João Piloto',
  username: 'joao_piloto',
  email: 'joao@example.com',
  password: secretPassword,
  city: 'Maceió',
  state: 'AL',
  acceptTerms: true,
  termsVersion: 'prelaunch-draft',
  privacyVersion: 'prelaunch-draft',
};
const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL:
    databaseUrl ?? 'postgresql://test:example@127.0.0.1:55432/apex_ride',
  DATABASE_SSL: process.env.DATABASE_SSL ?? 'disable',
});
let admin: pg.Pool, pool: pg.Pool, app: FastifyInstance;
const mailer = new TestMailer();
let ip = 0;
interface Session {
  cookie: string;
  csrf: string;
  id: string;
}
async function call(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  body?: unknown,
  session?: Session,
  extra: Record<string, string> = {},
) {
  return app.inject({
    method,
    url,
    remoteAddress: `127.1.${Math.floor(ip / 250)}.${(ip % 250) + 1}`,
    headers: {
      origin,
      'x-apex-request': '1',
      ...(session
        ? { cookie: session.cookie, 'x-csrf-token': session.csrf }
        : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
}
async function register(overrides: Record<string, unknown> = {}) {
  return call('POST', '/api/auth/register', { ...payload, ...overrides });
}
async function login(
  email = payload.email,
  password = secretPassword,
  previous?: Session,
): Promise<Session> {
  const response = await call(
    'POST',
    '/api/auth/login',
    { email, password },
    previous,
  );
  expect(response.statusCode, response.body).toBe(200);
  return {
    cookie: String(response.headers['set-cookie']).split(';')[0]!,
    csrf: response.json().csrfToken,
    id: response.json().user.id,
  };
}
async function account() {
  expect((await register()).statusCode).toBe(201);
  return login();
}
async function requestReset() {
  const expected = mailer.messages.length + 1;
  const result = await call('POST', '/api/auth/password/forgot', {
    email: payload.email,
  });
  await vi.waitFor(() => expect(mailer.messages).toHaveLength(expected));
  return result;
}

function lastToken() {
  const token = mailer.messages
    .at(-1)
    ?.text.match(/#token=([A-Za-z0-9_-]{43})/);
  expect(token).toBeTruthy();
  return token![1]!;
}

describe.skipIf(!databaseUrl)(
  'autenticação com PostgreSQL real e esquema isolado',
  () => {
    beforeAll(async () => {
      admin = new pg.Pool({
        connectionString: config.databaseUrl,
        ssl:
          config.databaseSsl === 'verify-full'
            ? { rejectUnauthorized: true }
            : false,
      });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      pool = new pg.Pool({
        connectionString: config.databaseUrl,
        ssl:
          config.databaseSsl === 'verify-full'
            ? { rejectUnauthorized: true }
            : false,
        options: `-c search_path=${schema}`,
      });
      await migrate(pool);
      app = await buildApp({
        config,
        mailer,
        logger: false,
        database: { pool, check: async () => {}, close: async () => {} },
      });
    }, 20000);
    beforeEach(async () => {
      ip++;
      mailer.messages.length = 0;
      await pool.query(
        'ALTER TABLE admin_audit_logs DISABLE TRIGGER admin_audit_no_truncate',
      );
      await pool.query('TRUNCATE users,auth_rate_limits CASCADE');
      await pool.query(
        'ALTER TABLE admin_audit_logs ENABLE TRIGGER admin_audit_no_truncate',
      );
    });
    afterAll(async () => {
      if (app) await app.close();
      if (pool) await pool.end();
      if (admin) {
        if (!/^auth_test_[a-f0-9]{32}$/.test(schema))
          throw new Error('Esquema de teste inválido');
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
    });
    it('aplica migrações novamente sem perder dados', async () => {
      await account();
      await migrate(pool);
      expect(
        (await pool.query('SELECT count(*) FROM users')).rows[0].count,
      ).toBe('1');
    });
    it('cadastra, normaliza e persiste perfil, aceite e padrões seguros', async () => {
      const response = await register({
        email: ' JOAO@EXAMPLE.COM ',
        username: 'Joao_Piloto',
      });
      expect(response.statusCode).toBe(201);
      const user = (await pool.query('SELECT * FROM users')).rows[0];
      expect(user.email).toBe('joao@example.com');
      expect(user.username).toBe('joao_piloto');
      expect(user.password_hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1/);
      expect(await verifyPassword(secretPassword, user.password_hash)).toBe(
        true,
      );
      expect(user.terms_version).toBe('prelaunch-draft');
      expect(user.terms_accepted_at).toBeInstanceOf(Date);
      expect(
        (await pool.query('SELECT * FROM profiles')).rows[0],
      ).toMatchObject({ city: 'Maceió', state: 'AL', avatar_ref: null });
      expect(
        (await pool.query('SELECT * FROM privacy_settings')).rows[0],
      ).toMatchObject({
        profile_visibility: 'public',
        activity_visibility: 'public',
      });
      expect(response.body).not.toContain(secretPassword);
      expect(response.body).not.toContain('password_hash');
    });
    it.each([
      { email: 'JOAO@example.com', username: 'outro_piloto' },
      { email: 'outra@example.com', username: 'JOAO_PILOTO' },
    ])(
      'recusa duplicidade sem distinguir maiúsculas: %j',
      async (overrides) => {
        await register();
        const result = await register(overrides);
        expect(result.statusCode).toBe(409);
        expect(
          (await pool.query('SELECT count(*) FROM users')).rows[0].count,
        ).toBe('1');
      },
    );
    it.each([
      { displayName: '<script>' },
      { username: 'ab' },
      { username: 'a/b' },
      { email: 'invalido' },
      { email: '.joao@example.com' },
      { email: 'joao..piloto@example.com' },
      { password: 'curta' },
      { password: 'a'.repeat(129) },
      { state: 'ZZ' },
      { acceptTerms: false },
      { termsVersion: 'antiga' },
      { userId: randomUUID() },
      { displayName: 'a\nB' },
    ])('valida dados de cadastro no servidor: %j', async (overrides) => {
      expect((await register(overrides)).statusCode).toBe(400);
      expect(
        (await pool.query('SELECT count(*) FROM users')).rows[0].count,
      ).toBe('0');
    });
    it('aceita senha longa com espaços, Unicode e sem composição arbitrária', async () => {
      await register({
        password: ' '.repeat(2) + 'é'.repeat(90) + ' '.repeat(2),
      });
      await login(
        payload.email,
        ' '.repeat(2) + 'é'.repeat(90) + ' '.repeat(2),
      );
    });
    it('login emite cookie protegido, segredo hasheado e sessão restaurável', async () => {
      await register();
      const response = await call('POST', '/api/auth/login', {
        email: payload.email,
        password: secretPassword,
      });
      expect(response.statusCode).toBe(200);
      const cookie = String(response.headers['set-cookie']);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\//);
      const raw = cookie.split(';')[0]!.split('=')[1]!;
      expect(
        (await pool.query('SELECT secret_hash FROM user_sessions')).rows[0]
          .secret_hash,
      ).toBe(digest(raw));
      const restored = await call('GET', '/api/auth/me', undefined, {
        cookie: cookie.split(';')[0]!,
        csrf: response.json().csrfToken,
        id: '',
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json().user.displayName).toBe('João Piloto');
      expect(restored.headers['cache-control']).toBe('no-store');
      expect(restored.body).not.toContain('password_hash');
    });
    it('mesma mensagem para senha incorreta e conta inexistente', async () => {
      await register();
      const wrong = await call('POST', '/api/auth/login', {
        email: payload.email,
        password: 'senha errada',
      });
      const missing = await call('POST', '/api/auth/login', {
        email: 'inexistente@example.com',
        password: 'senha errada',
      });
      expect(wrong.statusCode).toBe(401);
      expect(missing.statusCode).toBe(401);
      expect(wrong.json()).toEqual(missing.json());
    });
    it('revoga sessão anterior no novo login e bloqueia sessão expirada/desativada', async () => {
      const first = await account();
      const second = await login(payload.email, secretPassword, first);
      expect(
        (await call('GET', '/api/auth/me', undefined, first)).statusCode,
      ).toBe(401);
      await pool.query(
        "UPDATE user_sessions SET expires_at=now()-interval '1 second'",
      );
      expect(
        (await call('GET', '/api/auth/me', undefined, second)).statusCode,
      ).toBe(401);
      const third = await login();
      await pool.query("UPDATE users SET account_status='disabled'");
      expect(
        (await call('GET', '/api/auth/me', undefined, third)).statusCode,
      ).toBe(401);
    });
    it('logout revoga no servidor e limpa cookie', async () => {
      const session = await account();
      const result = await call('POST', '/api/auth/logout', {}, session);
      expect(result.statusCode).toBe(200);
      expect(String(result.headers['set-cookie'])).toContain('Max-Age=0');
      expect(
        (await call('GET', '/api/users/me', undefined, session)).statusCode,
      ).toBe(401);
    });
    it('limita tentativas por conta mesmo com IPs diferentes e expira a janela', async () => {
      await register();
      for (let n = 0; n < 10; n++) {
        ip++;
        expect(
          (
            await call('POST', '/api/auth/login', {
              email: payload.email,
              password: 'errada',
            })
          ).statusCode,
        ).toBe(401);
      }
      ip++;
      expect(
        (
          await call('POST', '/api/auth/login', {
            email: payload.email,
            password: secretPassword,
          })
        ).statusCode,
      ).toBe(429);
      await pool.query(
        "UPDATE auth_rate_limits SET expires_at=now()-interval '1 second'",
      );
      await login();
    });
    it('limita tentativas por IP contra contas diferentes', async () => {
      for (let n = 0; n < 30; n++)
        await call('POST', '/api/auth/login', {
          email: `ausente${n}@example.com`,
          password: 'errada',
        });
      expect(
        (
          await call('POST', '/api/auth/login', {
            email: 'mais@example.com',
            password: 'errada',
          })
        ).statusCode,
      ).toBe(429);
    }, 15000); // 31 verificações sequenciais de senha com custo criptográfico real.
    it('impede leitura e escrita anônimas nas áreas pessoais', async () => {
      for (const path of [
        '/api/auth/me',
        '/api/users/me',
        '/api/users/me/privacy',
      ])
        expect((await call('GET', path)).statusCode).toBe(401);
      for (const path of [
        '/api/users/me',
        '/api/users/me/password',
        '/api/users/me/privacy',
      ])
        expect((await call('PATCH', path, {})).statusCode).toBe(401);
    });
    it('rejeita CSRF ausente, incorreto, origem externa e requisição simples', async () => {
      const s = await account();
      for (const extra of [
        { 'x-csrf-token': '' },
        { 'x-csrf-token': 'invalido' },
        { origin: 'https://externo.example' },
        { 'x-apex-request': '' },
      ])
        expect(
          (
            await call(
              'PATCH',
              '/api/users/me',
              { displayName: 'Alterado' },
              s,
              extra,
            )
          ).statusCode,
        ).toBe(403);
      expect(
        (await call('POST', '/api/auth/logout', {}, s, { 'x-csrf-token': '' }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await call(
            'POST',
            '/api/auth/login',
            { email: payload.email, password: secretPassword },
            undefined,
            { origin: 'https://externo.example' },
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (await call('GET', '/api/users/me', undefined, s)).json().user
          .displayName,
      ).toBe(payload.displayName);
    });
    it('edita somente campos permitidos e impede alteração de outro proprietário', async () => {
      const a = await account();
      await register({ email: 'outro@example.com', username: 'outro_piloto' });
      const b = await login('outro@example.com');
      const edit = await call(
        'PATCH',
        '/api/users/me',
        {
          displayName: 'Novo Nome',
          biography: 'Sobre mim',
          city: 'Recife',
          state: 'PE',
          username: 'novo_nome',
        },
        a,
      );
      expect(edit.statusCode).toBe(200);
      expect(edit.json().user).toMatchObject({
        displayName: 'Novo Nome',
        biography: 'Sobre mim',
        city: 'Recife',
        state: 'PE',
        username: 'novo_nome',
      });
      for (const data of [
        { id: b.id, displayName: 'Ataque' },
        { userId: b.id },
        { email: 'alterado@example.com' },
        { account_status: 'disabled' },
      ])
        expect((await call('PATCH', '/api/users/me', data, a)).statusCode).toBe(
          400,
        );
      expect(
        (
          await call(
            'PATCH',
            `/api/users/${b.id}`,
            { displayName: 'Ataque' },
            a,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (await call('GET', '/api/users/me', undefined, b)).json().user
          .displayName,
      ).toBe(payload.displayName);
      expect(
        (await call('PATCH', '/api/users/me', { username: 'OUTRO_PILOTO' }, a))
          .statusCode,
      ).toBe(409);
    });
    it('perfil público limita campos e perfil privado retorna 404 inclusive a outros usuários', async () => {
      const s = await account();
      const publicResult = await call('GET', '/api/users/joao_piloto');
      expect(publicResult.statusCode).toBe(200);
      expect(Object.keys(publicResult.json().user).sort()).toEqual([
        'avatarRef',
        'biography',
        'city',
        'displayName',
        'state',
        'username',
      ]);
      const defaults = await call('GET', '/api/users/me/privacy', undefined, s);
      expect(defaults.json().privacy).toEqual({
        profileVisibility: 'public',
        activityVisibility: 'public',
        liveLocationEnabled: false,
      });
      const saved = await call(
        'PATCH',
        '/api/users/me/privacy',
        { profileVisibility: 'private', activityVisibility: 'private' },
        s,
      );
      expect(saved.statusCode).toBe(200);
      expect(saved.json().privacy.liveLocationEnabled).toBe(false);
      expect((await call('GET', '/api/users/joao_piloto')).statusCode).toBe(
        404,
      );
      expect(
        (await call('GET', '/api/users/me', undefined, s)).statusCode,
      ).toBe(200);
      await register({ email: 'outro@example.com', username: 'outro' });
      const b = await login('outro@example.com');
      expect(
        (await call('GET', '/api/users/joao_piloto', undefined, b)).statusCode,
      ).toBe(404);
      expect(
        (
          await call(
            'PATCH',
            '/api/users/me/privacy',
            { liveLocationEnabled: true },
            s,
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await call(
            'PATCH',
            '/api/users/me/privacy',
            { profileVisibility: 'unknown' },
            s,
          )
        ).statusCode,
      ).toBe(400);
    });
    it('alteração de senha exige confirmação e revoga todas as sessões e tokens de recuperação', async () => {
      const first = await account(),
        second = await login();
      await requestReset();
      expect(
        (
          await call(
            'PATCH',
            '/api/users/me/password',
            { currentPassword: 'errada', newPassword },
            first,
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await call(
            'PATCH',
            '/api/users/me/password',
            { currentPassword: secretPassword, newPassword },
            second,
          )
        ).statusCode,
      ).toBe(200);
      for (const s of [first, second])
        expect(
          (await call('GET', '/api/auth/me', undefined, s)).statusCode,
        ).toBe(401);
      expect(
        (
          await call('POST', '/api/auth/password/reset', {
            token: lastToken(),
            password: secretPassword,
          })
        ).statusCode,
      ).toBe(400);
      await login(payload.email, newPassword);
    });
    it('recuperação responde igualmente para conta existente e inexistente sem expor token', async () => {
      await register();
      const valid = await requestReset();
      const absent = await call('POST', '/api/auth/password/forgot', {
        email: 'ausente@example.com',
      });
      expect(valid.statusCode).toBe(202);
      expect(valid.json()).toEqual(absent.json());
      expect(mailer.messages).toHaveLength(1);
      const token = lastToken();
      expect(valid.body).not.toContain(token);
      expect(
        (await pool.query('SELECT secret_hash FROM account_tokens')).rows[0]
          .secret_hash,
      ).toBe(digest(token));
    });
    it('redefine com token de uso único e revoga todas as sessões', async () => {
      const a = await account(),
        b = await login();
      await requestReset();
      const token = lastToken();
      expect(
        (
          await call('POST', '/api/auth/password/reset', {
            token,
            password: newPassword,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await call('POST', '/api/auth/password/reset', {
            token,
            password: secretPassword,
          })
        ).statusCode,
      ).toBe(400);
      for (const s of [a, b])
        expect(
          (await call('GET', '/api/auth/me', undefined, s)).statusCode,
        ).toBe(401);
      expect(
        (
          await call('POST', '/api/auth/login', {
            email: payload.email,
            password: secretPassword,
          })
        ).statusCode,
      ).toBe(401);
      await login(payload.email, newPassword);
    });
    it('rejeita tokens inválidos e expirados e senha curta', async () => {
      await register();
      await requestReset();
      const token = lastToken();
      expect(
        (
          await call('POST', '/api/auth/password/reset', {
            token,
            password: 'curta',
          })
        ).statusCode,
      ).toBe(400);
      for (const value of ['invalido', 'x'.repeat(43)])
        expect(
          (
            await call('POST', '/api/auth/password/reset', {
              token: value,
              password: newPassword,
            })
          ).statusCode,
        ).toBe(400);
      await pool.query(
        "UPDATE account_tokens SET expires_at=now()-interval '1 second'",
      );
      expect(
        (
          await call('POST', '/api/auth/password/reset', {
            token,
            password: newPassword,
          })
        ).statusCode,
      ).toBe(400);
      await login();
    });
    it('solicitações repetidas invalidam token anterior e limitam e-mails', async () => {
      await register();
      await requestReset();
      const first = lastToken();
      await requestReset();
      expect(
        (
          await call('POST', '/api/auth/password/reset', {
            token: first,
            password: newPassword,
          })
        ).statusCode,
      ).toBe(400);
      for (let n = 0; n < 5; n++)
        expect(
          (
            await call('POST', '/api/auth/password/forgot', {
              email: payload.email,
            })
          ).statusCode,
        ).toBe(202);
      await vi.waitFor(() => expect(mailer.messages).toHaveLength(3));
      expect(
        (
          await call('POST', '/api/auth/password/forgot', {
            email: payload.email,
          })
        ).statusCode,
      ).toBe(202);
      expect(
        (
          await call('POST', '/api/auth/password/forgot', {
            email: payload.email,
          })
        ).statusCode,
      ).toBe(429);
    });
    it('consome atomicamente um token sob redefinições simultâneas', async () => {
      await register();
      await requestReset();
      const token = lastToken();
      const results = await Promise.all([
        call('POST', '/api/auth/password/reset', {
          token,
          password: newPassword,
        }),
        call('POST', '/api/auth/password/reset', {
          token,
          password: secretPassword,
        }),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    });
    it('resposta da recuperação não aguarda SMTP nem expõe latência de entrega', async () => {
      await register();
      let finish!: () => void;
      let sending = false;
      const blocked = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const slow = await buildApp({
        config,
        logger: false,
        mailer: {
          send: () => {
            sending = true;
            return blocked;
          },
        },
        database: { pool, check: async () => {}, close: async () => {} },
      });
      try {
        const response = await slow.inject({
          method: 'POST',
          url: '/api/auth/password/forgot',
          headers: { 'x-apex-request': '1', origin },
          payload: { email: payload.email },
        });
        expect(response.statusCode).toBe(202);
        await vi.waitFor(() => expect(sending).toBe(true));
        await login();
      } finally {
        finish();
        await slow.close();
      }
    });
    it('SMTP com falha não expõe existência da conta nem deixa token utilizável', async () => {
      await register();
      const failed = await buildApp({
        config,
        logger: false,
        mailer: {
          send: async () => {
            throw new Error('senha SMTP secreta');
          },
        },
        database: { pool, check: async () => {}, close: async () => {} },
      });
      try {
        const result = await failed.inject({
          method: 'POST',
          url: '/api/auth/password/forgot',
          headers: { 'x-apex-request': '1', origin },
          payload: { email: payload.email },
        });
        expect(result.statusCode).toBe(202);
        expect(result.body).not.toContain('secreta');
        await vi.waitFor(async () =>
          expect(
            (await pool.query('SELECT used_at FROM account_tokens')).rows[0]
              ?.used_at,
          ).toBeInstanceOf(Date),
        );
      } finally {
        await failed.close();
      }
    });
    it('verificação de e-mail configurável exige token e impede uso cruzado', async () => {
      const verified = await buildApp({
        config: {
          ...config,
          auth: { ...config.auth, emailVerificationRequired: true },
        },
        logger: false,
        mailer,
        database: { pool, check: async () => {}, close: async () => {} },
      });
      const request = (url: string, data: Record<string, unknown>) =>
        verified.inject({
          method: 'POST',
          url,
          headers: { 'x-apex-request': '1', origin },
          payload: data,
        });
      try {
        expect((await request('/api/auth/register', payload)).statusCode).toBe(
          201,
        );
        const token = lastToken();
        expect(
          (
            await request('/api/auth/login', {
              email: payload.email,
              password: secretPassword,
            })
          ).statusCode,
        ).toBe(401);
        expect(
          (
            await request('/api/auth/password/reset', {
              token,
              password: newPassword,
            })
          ).statusCode,
        ).toBe(400);
        expect(
          (await request('/api/auth/email/verify', { token })).statusCode,
        ).toBe(200);
        expect(
          (await request('/api/auth/email/verify', { token })).statusCode,
        ).toBe(400);
        expect(
          (
            await request('/api/auth/login', {
              email: payload.email,
              password: secretPassword,
            })
          ).statusCode,
        ).toBe(200);
      } finally {
        await verified.close();
      }
    });
    it('cookies HTTPS usam Secure e prefixo __Host em produção', async () => {
      await register();
      const secure = await buildApp({
        config: {
          ...config,
          nodeEnv: 'production',
          auth: { ...config.auth, webOrigin: 'https://apex.example' },
        },
        logger: false,
        mailer,
        database: { pool, check: async () => {}, close: async () => {} },
      });
      try {
        const response = await secure.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { 'x-apex-request': '1', origin: 'https://apex.example' },
          payload: { email: payload.email, password: secretPassword },
        });
        expect(String(response.headers['set-cookie'])).toMatch(
          /^__Host-apex_session=/,
        );
        expect(String(response.headers['set-cookie'])).toMatch(/; Secure/);
      } finally {
        await secure.close();
      }
    });
  },
);
