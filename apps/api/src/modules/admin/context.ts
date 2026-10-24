import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Config } from '../../config/env.js';
import { adminPrincipal, audit, revalidate, type Operator } from './policy.js';
import { id } from './validation.js';
export function adminContext(
  app: FastifyInstance,
  pool: Pool | undefined,
  config: Config,
) {
  const db = () => {
    if (!pool) throw new Error('Database unavailable');
    return pool;
  };
  const principal = adminPrincipal(config, db);
  const param = (r: FastifyRequest) => id((r.params as { id: string }).id);
  async function tx<T>(
    op: Operator,
    permission: string,
    run: (c: PoolClient) => Promise<T>,
  ) {
    const c = await db().connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(220001)');
      await revalidate(c, op, permission);
      const result = await run(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return { app, db, config, principal, param, tx, audit };
}
export type AdminContext = ReturnType<typeof adminContext>;
