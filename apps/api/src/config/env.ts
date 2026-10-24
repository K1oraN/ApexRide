import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve, relative, sep } from 'node:path';

export interface Config {
  adminMfaKey: string;
  routing: { url: string; profile: string; token: string };
  geocoding?: { key: string; authorized: boolean };
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  corsOrigins: string[];
  databaseUrl: string;
  auth: {
    webOrigin: string;
    sessionHours: number;
    emailVerificationRequired: boolean;
    mailMode: 'test' | 'smtp';
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    mailFrom: string;
    termsVersion: string;
    privacyVersion: string;
    termsUrl: string;
    privacyUrl: string;
  };
  motorcycleStorageDir: string;
  databaseSsl: 'disable' | 'verify-full';
}

function invalid(name: string): never {
  throw new Error(`Variável de ambiente inválida: ${name}`);
}

function choice<T extends string>(
  value: string,
  options: readonly T[],
  name: string,
): T {
  if (!options.includes(value as T)) invalid(name);
  return value as T;
}

export function parseEnv(env: NodeJS.ProcessEnv): Config {
  const adminMfaKey = env.ADMIN_MFA_KEY ?? '';
  if (adminMfaKey && !/^[a-fA-F0-9]{64}$/.test(adminMfaKey))
    invalid('ADMIN_MFA_KEY');
  const nodeEnv = choice(
    env.NODE_ENV ?? 'development',
    ['development', 'test', 'production'],
    'NODE_ENV',
  );
  const routingUrl = env.ROUTING_OSRM_URL ?? '';
  if (routingUrl) {
    try {
      const endpoint = new URL(routingUrl);
      if (
        !['http:', 'https:'].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        (nodeEnv === 'production' &&
          (endpoint.protocol !== 'https:' ||
            endpoint.hostname === 'router.project-osrm.org'))
      )
        invalid('ROUTING_OSRM_URL');
    } catch {
      invalid('ROUTING_OSRM_URL');
    }
  }
  const routingProfile = env.ROUTING_OSRM_PROFILE ?? 'driving';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(routingProfile))
    invalid('ROUTING_OSRM_PROFILE');
  const portText = env.PORT ?? '3001';
  const port = Number(portText);
  if (
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    invalid('PORT');
  const host = env.HOST ?? '127.0.0.1';
  if (!host.trim()) invalid('HOST');
  const logLevel = choice(
    env.LOG_LEVEL ?? 'info',
    ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    'LOG_LEVEL',
  );
  const corsOrigins = (
    env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((origin) => origin.trim());
  for (const origin of corsOrigins) {
    try {
      const url = new URL(origin);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        (nodeEnv === 'production' && url.protocol !== 'https:') ||
        url.origin !== origin ||
        origin.includes('*')
      )
        invalid('CORS_ORIGINS');
    } catch {
      invalid('CORS_ORIGINS');
    }
  }
  const databaseUrl = env.DATABASE_URL ?? '';
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    invalid('DATABASE_URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2
  )
    invalid('DATABASE_URL');
  // Parâmetros podem sobrescrever host, credenciais e TLS no driver pg.
  if (url.search || url.hash) invalid('DATABASE_URL');
  const databaseSsl = choice(
    env.DATABASE_SSL ?? 'verify-full',
    ['disable', 'verify-full'],
    'DATABASE_SSL',
  );
  if (
    databaseSsl === 'disable' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    invalid('DATABASE_SSL');
  const webOrigin = env.AUTH_WEB_ORIGIN ?? 'http://127.0.0.1:5173';
  try {
    const web = new URL(webOrigin);
    if (
      web.origin !== webOrigin ||
      !['http:', 'https:'].includes(web.protocol) ||
      (nodeEnv === 'production' && web.protocol !== 'https:')
    )
      invalid('AUTH_WEB_ORIGIN');
  } catch {
    invalid('AUTH_WEB_ORIGIN');
  }
  const sessionHours = Number(env.AUTH_SESSION_HOURS ?? '168');
  if (!Number.isInteger(sessionHours) || sessionHours < 1 || sessionHours > 720)
    invalid('AUTH_SESSION_HOURS');
  const boolean = (name: string, fallback: string) =>
    choice(env[name] ?? fallback, ['true', 'false'], name) === 'true';
  const mailMode = choice(
    env.MAIL_MODE ?? 'test',
    ['test', 'smtp'],
    'MAIL_MODE',
  );
  const smtpHost = env.SMTP_HOST ?? '';
  const smtpPort = Number(env.SMTP_PORT ?? '587');
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
    invalid('SMTP_PORT');
  const smtpUser = env.SMTP_USER ?? '';
  const smtpPass = env.SMTP_PASS ?? '';
  const mailFrom = env.MAIL_FROM ?? 'Apex Ride <no-reply@example.invalid>';
  if (/[\r\n]/.test(mailFrom) || !mailFrom.includes('@')) invalid('MAIL_FROM');
  if (Boolean(smtpUser) !== Boolean(smtpPass)) invalid('SMTP_USER/SMTP_PASS');
  if (mailMode === 'smtp' && !smtpHost) invalid('SMTP_HOST');
  if (nodeEnv === 'production' && mailMode !== 'smtp') invalid('MAIL_MODE');
  const termsVersion = env.TERMS_VERSION ?? 'prelaunch-draft';
  const privacyVersion = env.PRIVACY_VERSION ?? 'prelaunch-draft';
  const termsUrl = env.TERMS_URL ?? '/documentos';
  const privacyUrl = env.PRIVACY_URL ?? '/documentos';
  for (const [name, value] of [
    ['TERMS_URL', termsUrl],
    ['PRIVACY_URL', privacyUrl],
  ]) {
    try {
      const legal = new URL(value!, webOrigin);
      if (
        !['https:', 'http:'].includes(legal.protocol) ||
        (nodeEnv === 'production' && legal.protocol !== 'https:')
      )
        invalid(name!);
    } catch {
      invalid(name!);
    }
  }
  if (
    termsVersion.length > 100 ||
    privacyVersion.length > 100 ||
    !termsVersion ||
    !privacyVersion
  )
    invalid('TERMS_VERSION/PRIVACY_VERSION');
  if (
    nodeEnv === 'production' &&
    (!env.TERMS_URL ||
      !env.PRIVACY_URL ||
      termsVersion === 'prelaunch-draft' ||
      privacyVersion === 'prelaunch-draft')
  )
    invalid('TERMS_VERSION/PRIVACY_VERSION');
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const motorcycleStorageDir = resolve(
    root,
    env.MOTORCYCLE_STORAGE_DIR ?? '.local/motorcycle-photos',
  );
  if (env.MOTORCYCLE_STORAGE_DIR && !isAbsolute(env.MOTORCYCLE_STORAGE_DIR))
    invalid('MOTORCYCLE_STORAGE_DIR');
  for (const unsafe of [
    'apps',
    'database',
    'docs',
    'scripts',
    'node_modules',
    '.git',
  ]) {
    const rel = relative(resolve(root, unsafe), motorcycleStorageDir);
    if (
      !rel ||
      (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
    )
      invalid('MOTORCYCLE_STORAGE_DIR');
  }
  if (
    motorcycleStorageDir === resolve(root) ||
    motorcycleStorageDir === resolve(root, '.local')
  )
    invalid('MOTORCYCLE_STORAGE_DIR');
  return {
    adminMfaKey,
    routing: {
      url: routingUrl.replace(/\/$/, ''),
      profile: routingProfile,
      token: env.ROUTING_OSRM_TOKEN ?? '',
    },
    geocoding: {
      key: (env.GEOCODING_MAPTILER_KEY ?? '').trim(),
      authorized: env.GEOCODING_AUTHORIZED === 'true',
    },
    motorcycleStorageDir,
    auth: {
      webOrigin,
      sessionHours,
      mailMode,
      smtpHost,
      smtpPort,
      smtpSecure: boolean('SMTP_SECURE', 'false'),
      smtpUser,
      smtpPass,
      mailFrom,
      termsVersion,
      privacyVersion,
      termsUrl,
      privacyUrl,
      emailVerificationRequired: boolean(
        'AUTH_REQUIRE_EMAIL_VERIFICATION',
        'false',
      ),
    },
    nodeEnv,
    host,
    port,
    logLevel,
    corsOrigins,
    databaseUrl,
    databaseSsl,
  };
}

export function loadConfig(): Config {
  // Caminho estável tanto em src/config quanto em dist/config; ambiente externo tem prioridade.
  const envPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(envPath)) loadEnvFile(envPath);
  return parseEnv(process.env);
}
