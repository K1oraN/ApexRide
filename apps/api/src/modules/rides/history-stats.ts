import type { Pool } from 'pg';
import { historyQuery } from './history-query.js';
export async function historyStats(
  db: Pool,
  query: Record<string, unknown>,
  owner: string,
) {
  const { where, values } = historyQuery(query, owner);
  const client = await db.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const totals = await client.query(
      `SELECT count(*)::int AS total,COALESCE(sum(r.distance_meters),0)::float8 AS distance_meters,COALESCE(sum(r.active_ms),0)::float8 AS active_ms,CASE WHEN sum(r.active_ms)>0 THEN sum(r.distance_meters)*3600/sum(r.active_ms) ELSE NULL END AS average_kmh,count(DISTINCT r.motorcycle_id)::int AS motorcycles FROM rides r WHERE ${where}`,
      values,
    );
    const modes = await client.query(
      `SELECT r.mode,count(*)::int AS total,sum(r.distance_meters)::float8 AS distance_meters,sum(r.active_ms)::float8 AS active_ms FROM rides r WHERE ${where} GROUP BY r.mode ORDER BY r.mode`,
      values,
    );
    const bikes = await client.query(
      `SELECT r.motorcycle_id AS id,(array_agg(r.motorcycle_snapshot ORDER BY r.started_at DESC))[1] AS motorcycle,count(*)::int AS total,sum(r.distance_meters)::float8 AS distance_meters FROM rides r WHERE ${where} GROUP BY r.motorcycle_id ORDER BY sum(r.distance_meters) DESC,r.motorcycle_id LIMIT 121`,
      values,
    );
    const months = await client.query(
      `SELECT to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS month,count(*)::int AS total,sum(r.distance_meters)::float8 AS distance_meters,sum(r.active_ms)::float8 AS active_ms FROM rides r WHERE ${where} GROUP BY 1 ORDER BY 1 DESC LIMIT 121`,
      values,
    );
    await client.query('COMMIT');
    return {
      status: 'ok',
      totals: totals.rows[0],
      modes: modes.rows,
      motorcycles: bikes.rows.slice(0, 120),
      months: months.rows.slice(0, 120),
      limited: {
        motorcycles: bikes.rows.length > 120,
        months: months.rows.length > 120,
      },
      source: 'saved-server-rides',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
