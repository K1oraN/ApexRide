import type { Pool } from 'pg';
import { gpsPoints } from '../rides/history-data.js';
import { AuthError } from '../auth/validation.js';
import { prepare, RULES } from './geometry.js';
import type { ActiveInterval } from '@apex-ride/ride-core';
import type { Match } from './engine.js';

export async function source(db: Pool, id: string, owner?: string) {
  const row = (
    await db.query<{
      id: string;
      owner_id: string;
      started_at: Date;
      active_intervals: ActiveInterval[];
    }>(
      `SELECT id,owner_id,started_at,active_intervals FROM rides WHERE id=$1 AND deleted_at IS NULL ${owner ? 'AND owner_id=$2' : ''}`,
      owner ? [id, owner] : [id],
    )
  ).rows[0];
  if (!row) throw new AuthError(404, 'Atividade não encontrada.');
  return row;
}
export async function prepared(db: Pool, id: string) {
  const row = await source(db, id);
  return { row, gps: prepare(await gpsPoints(db, id), row.active_intervals) };
}
export async function backfill(db: Pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO similarity_backfill_cursor(version) VALUES($1) ON CONFLICT DO NOTHING',
      [RULES.version],
    );
    const cursor = (
      await client.query<{ last_id: string; completed: boolean }>(
        'SELECT last_id,completed FROM similarity_backfill_cursor WHERE version=$1 FOR UPDATE SKIP LOCKED',
        [RULES.version],
      )
    ).rows[0];
    if (cursor && !cursor.completed) {
      const rows = await client.query<{ id: string }>(
        'SELECT id FROM rides WHERE id>$1 AND deleted_at IS NULL ORDER BY id LIMIT 25',
        [cursor.last_id],
      );
      const changed = await client.query(
        `INSERT INTO ride_similarity_index(ride_id,version) SELECT unnest($1::uuid[]),$2 ON CONFLICT(ride_id) DO UPDATE SET version=EXCLUDED.version,status='queued',geometry=NULL,attempts=0,quality='{}',lease_until=NULL,next_attempt=now() WHERE ride_similarity_index.version<>EXCLUDED.version RETURNING ride_id`,
        [rows.rows.map((r) => r.id), RULES.version],
      );
      if (changed.rowCount)
        await client.query(
          'DELETE FROM ride_similarity_matches WHERE a=ANY($1::uuid[]) OR b=ANY($1::uuid[])',
          [changed.rows.map((r) => r.ride_id)],
        );
      await client.query(
        'UPDATE similarity_backfill_cursor SET last_id=$2,completed=$3,updated_at=now() WHERE version=$1',
        [
          RULES.version,
          rows.rows.at(-1)?.id ?? cursor.last_id,
          rows.rows.length < 25,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
// GiST geography filter runs before bounded detailed analysis. No GPS leaves
// the backend for community candidates. Reverse pair order has one unique key.
export const CANDIDATES_SQL = `SELECT s.ride_id FROM ride_similarity_index s JOIN rides r ON r.id=s.ride_id JOIN users u ON u.id=r.owner_id JOIN privacy_settings ps ON ps.user_id=r.owner_id
 JOIN rides origin ON origin.id=$1 JOIN users ou ON ou.id=origin.owner_id JOIN privacy_settings ops ON ops.user_id=origin.owner_id
 WHERE s.ride_id<>$1 AND s.version=$2 AND s.geometry IS NOT NULL AND r.deleted_at IS NULL AND origin.deleted_at IS NULL
 AND (r.owner_id=origin.owner_id OR (r.comparison_enabled AND origin.comparison_enabled AND r.visibility='public' AND origin.visibility='public' AND ps.profile_visibility='public' AND ops.profile_visibility='public' AND u.account_status='active' AND ou.account_status='active'))
 AND public.ST_DWithin(s.geometry,(SELECT geometry FROM ride_similarity_index WHERE ride_id=$1),30)
 ORDER BY s.ride_id LIMIT $3`;
export async function candidates(db: Pool, id: string) {
  return (
    await db.query<{ ride_id: string }>(CANDIDATES_SQL, [
      id,
      RULES.version,
      RULES.maxCandidates + 1,
    ])
  ).rows;
}
export async function ownMatch(db: Pool, a: string, b: string, owner: string) {
  const ids = [a, b].sort();
  const row = (
    await db.query<{ a: string; b: string; result: Match }>(
      `SELECT m.a,m.b,m.result FROM ride_similarity_matches m JOIN ride_similarity_index ia ON ia.ride_id=m.a AND ia.status='done' AND ia.version=m.version JOIN ride_similarity_index ib ON ib.ride_id=m.b AND ib.status='done' AND ib.version=m.version JOIN rides a ON a.id=m.a JOIN rides b ON b.id=m.b WHERE m.a=$1 AND m.b=$2 AND m.version=$3 AND a.owner_id=$4 AND b.owner_id=$4 AND a.deleted_at IS NULL AND b.deleted_at IS NULL`,
      [...ids, RULES.version, owner],
    )
  ).rows[0];
  if (!row) throw new AuthError(404, 'Correspondência indisponível.');
  return row;
}
