import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const localEnv = {
  DATABASE_URL: 'postgresql://local:example@127.0.0.1:5432/apex_ride',
  DATABASE_SSL: 'disable',
};

describe('configuração do ambiente', () => {
  it('aceita banco local e usa padrões restritos', () => {
    const config = parseEnv(localEnv);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3001);
    expect(config.corsOrigins).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it.each(['0', '65536', 'NaN', '1.5', ''])(
    'recusa porta inválida: %s',
    (port) => {
      expect(() => parseEnv({ ...localEnv, PORT: port })).toThrow('PORT');
    },
  );

  it.each([
    '*',
    'https://*.example.com',
    'http://localhost:5173/',
    'null',
    'file:///tmp',
  ])('recusa origem inválida: %s', (origin) => {
    expect(() => parseEnv({ ...localEnv, CORS_ORIGINS: origin })).toThrow(
      'CORS_ORIGINS',
    );
  });

  it('valida o banco sem expor valores de credenciais', () => {
    expect(() => parseEnv({ DATABASE_URL: 'senha-ultrassecreta' })).toThrow(
      /^Variável de ambiente inválida: DATABASE_URL$/,
    );
    expect(() =>
      parseEnv({
        ...localEnv,
        DATABASE_URL: 'postgresql://local@localhost/apex_ride',
      }),
    ).toThrow('DATABASE_URL');
  });

  it('exige TLS com certificado validado em banco remoto', () => {
    const remote = 'postgresql://local:example@db.example.com/apex_ride';
    expect(() => parseEnv({ ...localEnv, DATABASE_URL: remote })).toThrow(
      'DATABASE_SSL',
    );
    expect(parseEnv({ DATABASE_URL: remote }).databaseSsl).toBe('verify-full');
  });

  it('recusa parâmetros que podem sobrescrever host ou configuração TLS', () => {
    for (const suffix of [
      '?sslmode=no-verify',
      '?host=db.example.com',
      '#fragment',
    ]) {
      expect(() =>
        parseEnv({
          ...localEnv,
          DATABASE_URL: `${localEnv.DATABASE_URL}${suffix}`,
        }),
      ).toThrow('DATABASE_URL');
    }
  });

  it('recusa níveis de log, modo e TLS desconhecidos', () => {
    for (const [key, value] of [
      ['LOG_LEVEL', 'everything'],
      ['NODE_ENV', 'unknown'],
      ['DATABASE_SSL', 'no-verify'],
    ]) {
      expect(() => parseEnv({ ...localEnv, [key!]: value })).toThrow(key);
    }
  });
});

describe('configuração de autenticação e e-mail', () => {
  it('usa sessão de sete dias e teste de e-mail explícito no desenvolvimento', () => {
    expect(parseEnv(localEnv).auth).toMatchObject({
      sessionHours: 168,
      mailMode: 'test',
      emailVerificationRequired: false,
      termsVersion: 'prelaunch-draft',
    });
  });
  it.each([
    ['AUTH_SESSION_HOURS', '0'],
    ['AUTH_SESSION_HOURS', '721'],
    ['AUTH_REQUIRE_EMAIL_VERIFICATION', 'yes'],
    ['AUTH_WEB_ORIGIN', 'javascript:alert(1)'],
    ['SMTP_PORT', '0'],
    ['SMTP_SECURE', 'yes'],
    ['SMTP_USER', 'incompleto'],
    ['TERMS_URL', 'javascript:alert(1)'],
  ])('recusa configuração inválida %s', (key, value) => {
    expect(() => parseEnv({ ...localEnv, [key]: value })).toThrow();
  });
  const production = {
    ...localEnv,
    NODE_ENV: 'production',
    AUTH_WEB_ORIGIN: 'https://apex.example',
    CORS_ORIGINS: 'https://apex.example',
    MAIL_MODE: 'smtp',
    SMTP_HOST: 'smtp.example',
    MAIL_FROM: 'Apex Ride <conta@example.com>',
    TERMS_URL: 'https://apex.example/termos',
    PRIVACY_URL: 'https://apex.example/politica',
    TERMS_VERSION: '2026-10',
    PRIVACY_VERSION: '2026-10',
  };
  it('exige HTTPS, SMTP e versões dos textos finais na produção', () => {
    expect(parseEnv(production).nodeEnv).toBe('production');
    for (const override of [
      { AUTH_WEB_ORIGIN: 'http://apex.example' },
      { CORS_ORIGINS: 'http://apex.example' },
      { CORS_ORIGINS: 'https://apex.example,http://localhost:5173' },
      { MAIL_MODE: 'test' },
      { SMTP_HOST: '' },
      { TERMS_VERSION: 'prelaunch-draft' },
      { PRIVACY_URL: 'http://apex.example/politica' },
    ])
      expect(() => parseEnv({ ...production, ...override })).toThrow();
  });
});
