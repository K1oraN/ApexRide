import pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config/env.js';

export interface Database {
  pool?: pg.Pool;
  check(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(
  config: Config,
  logger: FastifyBaseLogger,
): Database {
  const pool = createPool(config);
  pool.on('error', () => {
    logger.error({ event: 'database_pool_error' }, 'Falha no pool de conexões');
  });
  return {
    pool,
    async check() {
      const result = await pool.query<{ version: string }>(
        'SELECT postgis_version() AS version',
      );
      if (!result.rows[0]?.version) throw new Error('PostGIS indisponível');
    },
    async close() {
      await pool.end();
    },
  };
}

export function createPool(config: Config): pg.Pool {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    ssl:
      config.databaseSsl === 'verify-full'
        ? { rejectUnauthorized: true }
        : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    application_name: 'apex-ride-api',
  });
}
