import {
  createPrincipal,
  sessionGuard,
  selectUser,
  type UserRow,
} from './session.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { Config } from '../../config/env.js';
import type { Mailer } from './mail.js';
import {
  csrfFor,
  digest,
  hashPassword,
  secret,
  verifyPassword,
} from './security.js';
import * as v from './validation.js';
import { notBlocked } from '../social/policy.js';

const privacy = (u: UserRow) => ({
  profileVisibility: u.profile_visibility,
  activityVisibility: u.activity_visibility,
  liveLocationEnabled: false,
});
const publicUser = (u: UserRow) => ({
  displayName: u.display_name,
  username: u.username,
  biography: u.biography,
  city: u.city,
  state: u.state,
  avatarRef: null,
});
const ownUser = (u: UserRow) => ({
  ...publicUser(u),
  administrativeAccess: u.admin_access === true,
  id: u.id,
  email: u.email,
  emailVerified: Boolean(u.email_verified_at),
  createdAt: u.created_at,
  privacy: privacy(u),
  telemetry: { speedMode: u.speed_mode },
});
const genericMail = {
  status: 'ok',
  message:
    'Se houver uma conta elegível, você receberá um e-mail com as instruções.',
};
const credentialsError = () =>
  new v.AuthError(401, 'E-mail ou senha inválidos, ou acesso indisponível.');

export async function authRoutes(
  app: FastifyInstance,
  options: { config: Config; pool?: Pool | undefined; mailer: Mailer },
) {
  const { config, mailer } = options;
  const cookieName =
    config.nodeEnv === 'production' ? '__Host-apex_session' : 'apex_session';
  const cookieOptions = {
    httpOnly: true,
    secure:
      config.nodeEnv === 'production' ||
      config.auth.webOrigin.startsWith('https:'),
    sameSite: 'lax' as const,
    path: '/',
  };
  const db = () => {
    if (!options.pool) throw new v.AuthError(503, 'Serviço indisponível.');
    return options.pool;
  };
  // Hash fictício somente para equalizar a verificação de credenciais inexistentes.
  const dummyHash = await hashPassword(secret());

  app.addHook('onRequest', sessionGuard(config));
  const principal = createPrincipal(config, db);

  async function transaction<T>(action: (client: PoolClient) => Promise<T>) {
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async function limit(
    request: FastifyRequest,
    category: string,
    maximum: number,
    minutes: number,
    identity?: string,
  ) {
    const key = digest(`${category}:${identity ?? request.ip}`);
    const result = await db().query(
      `INSERT INTO auth_rate_limits(key_hash,attempts,expires_at)
      VALUES($1,1,now()+$2 * interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET
      attempts=CASE WHEN auth_rate_limits.expires_at <= now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
      expires_at=CASE WHEN auth_rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END
      RETURNING attempts`,
      [key, minutes],
    );
    if (result.rows[0].attempts > maximum)
      throw new v.AuthError(
        429,
        'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      );
  }
  async function newSession(
    client: PoolClient,
    userId: string,
    reply: FastifyReply,
    previous?: string,
  ) {
    if (previous)
      await client.query(
        'UPDATE user_sessions SET revoked_at=now() WHERE secret_hash=$1',
        [digest(previous)],
      );
    const raw = secret();
    const expiresAt = new Date(
      Date.now() + config.auth.sessionHours * 3600_000,
    );
    await client.query(
      'INSERT INTO user_sessions(id,user_id,secret_hash,expires_at) VALUES($1,$2,$3,$4)',
      [randomUUID(), userId, digest(raw), expiresAt],
    );
    // Cookie emitido pelo chamador somente após COMMIT.
    return { raw, expiresAt, reply };
  }
  function sendSession(session: Awaited<ReturnType<typeof newSession>>) {
    session.reply.setCookie(cookieName, session.raw, {
      ...cookieOptions,
      expires: session.expiresAt,
      maxAge: config.auth.sessionHours * 3600,
    });
    return csrfFor(session.raw);
  }
  async function sendToken(
    userId: string,
    address: string,
    purpose: 'password_reset' | 'email_verify',
  ) {
    const raw = secret();
    const id = randomUUID();
    await transaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        userId,
      ]);
      await client.query(
        'UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',
        [userId, purpose],
      );
      await client.query(
        "INSERT INTO account_tokens(id,user_id,purpose,secret_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes')",
        [id, userId, purpose, digest(raw)],
      );
    });
    const route =
      purpose === 'password_reset' ? '/redefinir-senha' : '/verificar-email';
    const link = `${config.auth.webOrigin}${route}#token=${raw}`;
    try {
      await mailer.send({
        to: address,
        subject:
          purpose === 'password_reset'
            ? 'Redefina sua senha — Apex Ride'
            : 'Confirme seu e-mail — Apex Ride',
        text: `Use este link em até 30 minutos: ${link}\nSe você não solicitou, ignore este e-mail.`,
      });
    } catch {
      await db().query('UPDATE account_tokens SET used_at=now() WHERE id=$1', [
        id,
      ]);
      app.log.error(
        { event: 'account_mail_failed' },
        'Falha no envio de e-mail da conta',
      );
    }
  }
  // A resposta não aguarda SMTP: evita revelar a existência da conta por latência de envio.
  // Sem fila durável nesta etapa; o usuário pode solicitar novo envio após uma interrupção.
  const mailTasks = new Set<Promise<void>>();
  app.addHook('onClose', async () => {
    await Promise.allSettled([...mailTasks]);
  });
  function scheduleMail(
    userId: string,
    address: string,
    purpose: 'password_reset' | 'email_verify',
  ) {
    const task = sendToken(userId, address, purpose).catch(() => {
      app.log.error(
        { event: 'account_mail_task_failed' },
        'Falha no processamento de e-mail da conta',
      );
    });
    mailTasks.add(task);
    void task.then(() => mailTasks.delete(task));
  }
  async function current(userId: string) {
    const result = await db().query(`${selectUser} WHERE u.id=$1`, [userId]);
    return result.rows[0] as UserRow;
  }

  app.get('/auth/config', async () => ({
    status: 'ok',
    emailVerificationRequired: config.auth.emailVerificationRequired,
    legal: {
      termsVersion: config.auth.termsVersion,
      privacyVersion: config.auth.privacyVersion,
      termsUrl: config.auth.termsUrl,
      privacyUrl: config.auth.privacyUrl,
      preliminary:
        config.auth.termsVersion === 'prelaunch-draft' ||
        config.auth.privacyVersion === 'prelaunch-draft',
    },
  }));

  app.post('/auth/register', async (request, reply) => {
    await limit(request, 'register', 8, 60);
    const b = v.body(request.body, [
      'displayName',
      'username',
      'email',
      'password',
      'city',
      'state',
      'acceptTerms',
      'termsVersion',
      'privacyVersion',
    ]);
    const name = v.displayName(b.displayName),
      username = v.username(b.username),
      email = v.email(b.email),
      password = v.password(b.password);
    const city = v.text(b.city ?? '', 0, 80),
      state = v.state(b.state);
    if (
      b.acceptTerms !== true ||
      b.termsVersion !== config.auth.termsVersion ||
      b.privacyVersion !== config.auth.privacyVersion
    )
      return v.fail(
        'Leia e confirme as versões atuais dos termos e da política de privacidade.',
      );
    const hash = await hashPassword(password),
      id = randomUUID();
    try {
      await transaction(async (client) => {
        await client.query(
          `INSERT INTO users(id,display_name,username,email,password_hash,terms_version,privacy_version) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            name,
            username,
            email,
            hash,
            config.auth.termsVersion,
            config.auth.privacyVersion,
          ],
        );
        await client.query(
          'INSERT INTO profiles(id,user_id,city,state) VALUES($1,$2,$3,$4)',
          [randomUUID(), id, city, state],
        );
        await client.query('INSERT INTO privacy_settings(user_id) VALUES($1)', [
          id,
        ]);
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      )
        throw new v.AuthError(
          409,
          'Não foi possível cadastrar com estes dados. Tente outro nome de usuário ou recupere seu acesso.',
        );
      throw error;
    }
    if (config.auth.emailVerificationRequired)
      await sendToken(id, email, 'email_verify');
    return reply.code(201).send({
      status: 'ok',
      message: config.auth.emailVerificationRequired
        ? 'Conta criada. Confira seu e-mail antes de entrar.'
        : 'Conta criada. Entre para continuar.',
    });
  });
  app.post('/auth/login', async (request, reply) => {
    await limit(request, 'login-ip', 30, 15);
    const b = v.body(request.body, ['email', 'password']);
    const email = v.email(b.email),
      password = v.text(b.password, 1, 128, false);
    await limit(request, 'login-account', 10, 15, email);
    const session = await transaction(async (client) => {
      const result = await client.query(
        'SELECT * FROM users WHERE email=$1 FOR UPDATE',
        [email],
      );
      const user = result.rows[0] as UserRow | undefined;
      const valid = await verifyPassword(
        password,
        user?.password_hash ?? dummyHash,
      );
      if (
        !user ||
        !valid ||
        user.account_status !== 'active' ||
        (config.auth.emailVerificationRequired && !user.email_verified_at)
      )
        throw credentialsError();
      return newSession(client, user.id, reply, request.cookies[cookieName]);
    });
    const result = await db().query(
      'SELECT user_id FROM user_sessions WHERE secret_hash=$1',
      [digest(session.raw)],
    );
    return {
      status: 'ok',
      user: ownUser(await current(result.rows[0].user_id)),
      csrfToken: sendSession(session),
    };
  });
  const me = async (request: FastifyRequest) => {
    const { user, raw } = await principal(request);
    return { status: 'ok', user: ownUser(user), csrfToken: csrfFor(raw) };
  };
  app.get('/auth/me', me);
  app.get('/users/me', me);
  app.post('/auth/logout', async (request, reply) => {
    const { raw } = await principal(request, true);
    await db().query(
      'UPDATE user_sessions SET revoked_at=now() WHERE secret_hash=$1',
      [digest(raw)],
    );
    reply.clearCookie(cookieName, cookieOptions);
    return { status: 'ok' };
  });
  app.patch('/users/me', async (request) => {
    const { user } = await principal(request, true);
    const b = v.body(request.body, [
      'displayName',
      'username',
      'biography',
      'city',
      'state',
    ]);
    if (!Object.keys(b).length) return v.fail();
    const name =
      b.displayName === undefined
        ? user.display_name
        : v.displayName(b.displayName);
    const username =
      b.username === undefined ? user.username : v.username(b.username);
    const bio =
      b.biography === undefined ? user.biography : v.text(b.biography, 0, 300);
    const city = b.city === undefined ? user.city : v.text(b.city, 0, 80);
    const state = b.state === undefined ? user.state : v.state(b.state);
    try {
      await transaction(async (client) => {
        await client.query(
          'UPDATE users SET display_name=$1,username=$2,updated_at=now() WHERE id=$3',
          [name, username, user.id],
        );
        await client.query(
          'UPDATE profiles SET biography=$1,city=$2,state=$3,updated_at=now() WHERE user_id=$4',
          [bio, city, state, user.id],
        );
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      )
        throw new v.AuthError(409, 'Nome de usuário indisponível.');
      throw error;
    }
    return { status: 'ok', user: ownUser(await current(user.id)) };
  });
  app.patch('/users/me/telemetry', async (request) => {
    const { user } = await principal(request, true);
    const b = v.body(request.body, ['speedMode']);
    if (b.speedMode !== 'pure' && b.speedMode !== 'assisted') return v.fail();
    await db().query('UPDATE users SET speed_mode=$1 WHERE id=$2', [
      b.speedMode,
      user.id,
    ]);
    return { status: 'ok', telemetry: { speedMode: b.speedMode } };
  });
  app.get('/users/me/privacy', async (request) => ({
    status: 'ok',
    privacy: privacy((await principal(request)).user),
  }));
  app.patch('/users/me/privacy', async (request) => {
    const { user } = await principal(request, true);
    const b = v.body(request.body, ['profileVisibility', 'activityVisibility']);
    if (!Object.keys(b).length) return v.fail();
    const profile =
      b.profileVisibility === undefined
        ? user.profile_visibility
        : v.visibility(b.profileVisibility);
    const activity =
      b.activityVisibility === undefined
        ? user.activity_visibility
        : v.visibility(b.activityVisibility);
    await transaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        user.id,
      ]);
      await client.query(
        'UPDATE privacy_settings SET profile_visibility=$1,activity_visibility=$2,updated_at=now() WHERE user_id=$3',
        [profile, activity, user.id],
      );
    });
    return {
      status: 'ok',
      privacy: {
        profileVisibility: profile,
        activityVisibility: activity,
        liveLocationEnabled: false,
      },
    };
  });
  app.get<{ Params: { username: string } }>(
    '/users/:username',
    async (request, reply) => {
      const username = v.username(request.params.username);
      let viewer: string | null = null;
      try {
        viewer = (await principal(request)).user.id;
      } catch (error) {
        if (!(error instanceof v.AuthError && error.statusCode === 401))
          throw error;
      }
      const result = await db().query(
        `${selectUser} WHERE u.username=$1 AND u.account_status='active' AND ps.profile_visibility='public' AND ${notBlocked('u.id', '$2')}`,
        [username, viewer],
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ status: 'error', message: 'Perfil indisponível.' });
      return { status: 'ok', user: publicUser(result.rows[0]) };
    },
  );
  app.patch('/users/me/password', async (request, reply) => {
    const { user } = await principal(request, true);
    await limit(request, 'change-password', 5, 15, user.id);
    const b = v.body(request.body, ['currentPassword', 'newPassword']);
    const old = v.text(b.currentPassword, 1, 128, false),
      password = v.password(b.newPassword);
    const hash = await hashPassword(password);
    await transaction(async (client) => {
      const result = await client.query(
        'SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',
        [user.id],
      );
      if (!(await verifyPassword(old, result.rows[0].password_hash)))
        throw new v.AuthError(400, 'Não foi possível confirmar a senha atual.');
      await client.query(
        'UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',
        [hash, user.id],
      );
      await client.query(
        'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [user.id],
      );
      await client.query(
        "UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND purpose='password_reset' AND used_at IS NULL",
        [user.id],
      );
    });
    reply.clearCookie(cookieName, cookieOptions);
    return {
      status: 'ok',
      message: 'Senha alterada. Entre novamente em seus dispositivos.',
    };
  });

  async function requestMail(
    request: FastifyRequest,
    reply: FastifyReply,
    purpose: 'password_reset' | 'email_verify',
  ) {
    await limit(request, `${purpose}-ip`, 8, 15);
    const b = v.body(request.body, ['email']);
    const email = v.email(b.email);
    // Mesmo resultado para contas existentes, inexistentes e limite por endereço.
    try {
      await limit(request, `${purpose}-email`, 3, 15, email);
    } catch (error) {
      if (error instanceof v.AuthError && error.statusCode === 429)
        return reply.code(202).send(genericMail);
      throw error;
    }
    const result = await db().query(
      "SELECT id,email_verified_at FROM users WHERE email=$1 AND account_status='active'",
      [email],
    );
    const user = result.rows[0];
    if (user && (purpose === 'password_reset' || !user.email_verified_at))
      scheduleMail(user.id, email, purpose);
    return reply.code(202).send(genericMail);
  }
  app.post('/auth/password/forgot', (request, reply) =>
    requestMail(request, reply, 'password_reset'),
  );
  app.post('/auth/email/resend', (request, reply) =>
    requestMail(request, reply, 'email_verify'),
  );
  async function consumeToken(
    raw: string,
    purpose: 'password_reset' | 'email_verify',
    passwordHash?: string,
  ) {
    await transaction(async (client) => {
      const lookup = await client.query(
        'SELECT user_id FROM account_tokens WHERE secret_hash=$1 AND purpose=$2',
        [digest(raw), purpose],
      );
      if (!lookup.rows[0])
        throw new v.AuthError(400, 'Link inválido ou expirado.');
      const userId = lookup.rows[0].user_id;
      const user = await client.query(
        'SELECT account_status FROM users WHERE id=$1 FOR UPDATE',
        [userId],
      );
      const token = await client.query(
        'SELECT id FROM account_tokens WHERE secret_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE',
        [digest(raw), purpose],
      );
      if (!token.rows[0] || user.rows[0]?.account_status !== 'active')
        throw new v.AuthError(400, 'Link inválido ou expirado.');
      await client.query(
        'UPDATE account_tokens SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',
        [userId, purpose],
      );
      if (purpose === 'password_reset') {
        await client.query(
          'UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',
          [passwordHash, userId],
        );
        await client.query(
          'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
          [userId],
        );
      } else
        await client.query(
          'UPDATE users SET email_verified_at=now(),updated_at=now() WHERE id=$1',
          [userId],
        );
    });
  }
  app.post('/auth/password/reset', async (request, reply) => {
    await limit(request, 'reset-ip', 15, 15);
    const b = v.body(request.body, ['token', 'password']);
    const raw = v.token(b.token),
      password = v.password(b.password);
    await consumeToken(raw, 'password_reset', await hashPassword(password));
    reply.clearCookie(cookieName, cookieOptions);
    return {
      status: 'ok',
      message: 'Senha redefinida. Entre com a nova senha.',
    };
  });
  app.post('/auth/email/verify', async (request) => {
    await limit(request, 'verify-ip', 15, 15);
    const b = v.body(request.body, ['token']);
    await consumeToken(v.token(b.token), 'email_verify');
    return { status: 'ok', message: 'E-mail confirmado. Você já pode entrar.' };
  });
}
