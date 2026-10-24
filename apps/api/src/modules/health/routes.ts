import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database.js';

export async function healthRoutes(
  app: FastifyInstance,
  options: { database: Database },
) {
  app.get('/health', async () => ({ status: 'ok', service: 'apex-ride-api' }));
  app.get('/health/db', async (_request, reply) => {
    try {
      await options.database.check();
      return { status: 'ok', database: 'connected', postgis: 'enabled' };
    } catch {
      app.log.warn(
        { event: 'database_health_failed' },
        'Banco ou PostGIS indisponível',
      );
      return reply.code(503).send({ status: 'error', database: 'unavailable' });
    }
  });
}
