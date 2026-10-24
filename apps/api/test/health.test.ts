import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

const config = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://local:example@127.0.0.1:5432/apex_ride',
  DATABASE_SSL: 'disable',
});

const apps: FastifyInstance[] = [];
async function setup(failDatabase = false) {
  // Dublês somente nos testes; a aplicação real sempre usa o pool PostgreSQL.
  const database = {
    check: failDatabase
      ? vi.fn().mockRejectedValue(new Error('password=segredo host=privado'))
      : vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const app = await buildApp({ config, database, logger: false });
  apps.push(app);
  return { app, database };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('endpoints técnicos', () => {
  it('verifica a API sem depender do banco', async () => {
    const { app, database } = await setup(true);
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'apex-ride-api' });
    expect(database.check).not.toHaveBeenCalled();
  });

  it('retorna sucesso após consultar banco e PostGIS', async () => {
    const { app, database } = await setup();
    const response = await app.inject({ method: 'GET', url: '/api/health/db' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      database: 'connected',
      postgis: 'enabled',
    });
    expect(database.check).toHaveBeenCalledOnce();
  });

  it('retorna 503 sem detalhes sensíveis quando banco ou extensão falham', async () => {
    const { app } = await setup(true);
    const response = await app.inject({ method: 'GET', url: '/api/health/db' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      database: 'unavailable',
    });
    expect(response.body).not.toContain('segredo');
    expect(response.body).not.toContain('privado');
  });

  it('libera CORS apenas para a origem configurada', async () => {
    const { app } = await setup();
    const allowed = await app.inject({
      url: '/api/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    const denied = await app.inject({
      url: '/api/health',
      headers: { origin: 'https://unknown.example' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde ao preflight da origem permitida', async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toBe(
      'GET, POST, PATCH, DELETE',
    );
  });

  it('fecha as conexões ao encerrar a aplicação', async () => {
    const { app, database } = await setup();
    await app.ready();
    await app.close();
    expect(database.close).toHaveBeenCalledOnce();
  });

  it('não publica rotas de negócio', async () => {
    const { app } = await setup();
    const response = await app.inject({ url: '/api/users' });
    expect(response.statusCode).toBe(404);
  });

  it('oculta detalhes de erros internos', async () => {
    const { app } = await setup();
    app.get('/test-error', async () => {
      throw new Error('credencial-privada');
    });
    const response = await app.inject({ url: '/test-error' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      status: 'error',
      message: 'Erro interno',
      code: 'HTTP_500',
    });
  });

  it('correlaciona erros sem aceitar IDs externos nem permitir cache', async () => {
    const { app } = await setup();
    const first = await app.inject({
      url: '/api/inexistente?token=nao-registrar',
      headers: { 'x-request-id': 'forjado' },
    });
    const second = await app.inject({ url: '/api/inexistente' });
    expect(first.json()).toMatchObject({ code: 'HTTP_404' });
    expect(first.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(first.headers['x-request-id']).not.toBe(
      second.headers['x-request-id'],
    );
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['x-content-type-options']).toBe('nosniff');
    expect(first.headers['referrer-policy']).toBe('no-referrer');
    expect(first.body).not.toContain('nao-registrar');
  });
});
