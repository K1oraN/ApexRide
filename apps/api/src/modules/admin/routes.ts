import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import { sessionGuard } from '../auth/session.js';
import { LocalPhotoStorage, type PhotoStorage } from '../motorcycles/photos.js';
import { adminContext } from './context.js';
import { registerAdminAuth } from './auth-routes.js';
import { registerModeration } from './moderation-routes.js';
import { registerUsers } from './user-routes.js';
import { registerAppeals } from './appeal-routes.js';
import { registerPlatform } from './platform-routes.js';
import { registerIntegrity } from './integrity-routes.js';
import { registerSecurity } from './security-routes.js';
import { registerOperations } from './operations-routes.js';
import { registerRankingIntegrity } from './ranking-routes.js';
export async function adminRoutes(
  app: FastifyInstance,
  options: {
    config: Config;
    pool?: Pool | undefined;
    storage?: PhotoStorage | undefined;
  },
) {
  app.addHook('onRequest', sessionGuard(options.config));
  app.addHook('onRequest', async (_r, reply) => {
    reply
      .header('Cache-Control', 'private, no-store')
      .header('Vary', 'Cookie')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; sandbox",
      );
  });
  const ctx = adminContext(app, options.pool, options.config);
  registerAdminAuth(app, ctx.db, options.config);
  registerUsers(ctx);
  registerModeration(
    ctx,
    options.storage ??
      new LocalPhotoStorage(
        join(options.config.motorcycleStorageDir, 'social'),
      ),
  );
  registerAppeals(ctx);
  registerPlatform(ctx);
  registerIntegrity(ctx);
  registerRankingIntegrity(ctx);
  registerSecurity(ctx);
  registerOperations(ctx);
}
