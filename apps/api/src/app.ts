import Fastify, { type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { authRoutes } from './modules/auth/routes.js';
import { AuthError } from './modules/auth/validation.js';
import { createMailer, type Mailer } from './modules/auth/mail.js';
import type { Config } from './config/env.js';
import { createDatabase, type Database } from './database.js';
import { healthRoutes } from './modules/health/routes.js';
import { motorcycleRoutes } from './modules/motorcycles/routes.js';
import type { PhotoStorage } from './modules/motorcycles/photos.js';
import { rideRoutes } from './modules/rides/routes.js';
import { routeRoutes } from './modules/routes/routes.js';
import { publicRideRoutes } from './modules/rides/public.js';
import { comparisonRoutes } from './modules/comparisons/routes.js';
import { similarityRoutes } from './modules/similarity/routes.js';
import { startWorker } from './modules/similarity/worker.js';
import { socialRoutes } from './modules/social/routes.js';
import { groupRoutes } from './modules/groups/routes.js';
import { eventRoutes } from './modules/events/routes.js';
import { gamificationRoutes } from './modules/gamification/routes.js';
import { startGamificationWorker } from './modules/gamification/engine.js';
import { adminRoutes } from './modules/admin/routes.js';

export async function buildApp(options: {
  config: Config;
  database?: Database;
  logger?: false;
  mailer?: Mailer;
  motorcycleStorage?: PhotoStorage;
  socialStorage?: PhotoStorage;
}) {
  const { config } = options;
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
            ],
            serializers: {
              req: (req) => ({
                method: req.method,
                url: req.url.split('?')[0] ?? '/',
                remoteAddress: req.ip,
              }),
            },
          },
    bodyLimit: 16_384,
    requestTimeout: 10_000,
    return503OnClosing: true,
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
  });
  const database = options.database ?? createDatabase(config, app.log);
  // Leave pool capacity for Ride: administrative requests are bounded and never queued here.
  let administrativeRequests = 0;
  const countedAdministrative = new WeakSet<FastifyRequest>();
  const releaseAdministrative = async (request: FastifyRequest) => {
    if (countedAdministrative.delete(request)) administrativeRequests--;
  };
  app.addHook('onRequest', async (request, reply) => {
    if (!(request.routeOptions.url ?? request.url).startsWith('/api/admin/'))
      return;
    if (administrativeRequests >= 2)
      return reply.code(429).header('Retry-After', '1').send({
        status: 'error',
        message:
          'Central administrativa ocupada. Tente novamente em instantes.',
      });
    administrativeRequests++;
    countedAdministrative.add(request);
  });
  app.addHook('onResponse', releaseAdministrative);
  app.addHook('onRequestAbort', releaseAdministrative);
  app.addHook('onTimeout', releaseAdministrative);
  app.addHook('onClose', async () => {
    await database.close();
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) {
      if (error.statusCode === 429)
        reply.header(
          'Retry-After',
          /compar|social|events|gamification|circuits/.test(
            request.routeOptions.url ?? '',
          )
            ? '60'
            : '900',
        );
      return reply.code(error.statusCode).send({
        status: 'error',
        code: `HTTP_${error.statusCode}`,
        message: error.message,
      });
    }
    const code =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status =
      typeof code === 'number' && code >= 400 && code < 500 ? code : 500;
    request.log.error(
      { event: 'request_failed', status },
      'Falha ao processar requisição',
    );
    return reply.code(status).send({
      status: 'error',
      code: `HTTP_${status}`,
      message:
        status === 413 && /\/social\/media(?:\?|$)/.test(request.url)
          ? 'A fotografia deve ter no máximo 5 MiB.'
          : status === 413 && /\/rides(?:\?|$)/.test(request.url)
            ? 'A atividade excede 32 MiB. Nenhum ponto foi salvo; os dados temporários foram preservados no cliente.'
            : status === 413 &&
                /\/motorcycles\/[^/]+\/photo(?:\?|$)/.test(request.url)
              ? 'A fotografia deve ter no máximo 5 MB.'
              : status === 500
                ? 'Erro interno'
                : 'Requisição inválida',
    });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      status: 'error',
      code: 'HTTP_404',
      message: 'Rota não encontrada',
    }),
  );
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Apex-Request', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
  });
  await app.register(cookie);
  await app.register(authRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
    mailer: options.mailer ?? createMailer(config),
  });
  await app.register(healthRoutes, { prefix: '/api', database });
  await app.register(adminRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
    storage: options.socialStorage,
  });
  await app.register(groupRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
  });
  await app.register(eventRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
  });
  await app.register(gamificationRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
  });
  await app.register(socialRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
    storage: options.socialStorage,
  });
  await app.register(motorcycleRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
    storage: options.motorcycleStorage,
  });
  await app.register(rideRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
  });
  await app.register(routeRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
  });
  await app.register(publicRideRoutes, {
    prefix: '/api',
    pool: database.pool,
    config,
  });
  await app.register(comparisonRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
  });
  await app.register(similarityRoutes, {
    prefix: '/api',
    config,
    pool: database.pool,
  });
  if (database.pool && config.nodeEnv !== 'test') {
    const stop = startWorker(database.pool);
    app.addHook('onClose', stop);
    app.addHook('onClose', startGamificationWorker(database.pool));
  }
  return app;
}
