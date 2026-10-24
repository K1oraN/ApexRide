import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { backfill, candidates, prepared } from './repository.js';
import { recognize } from './engine.js';
import { RULES, searchLine } from './geometry.js';

/** Durable queue, one bounded job at a time per process, restartable leases. */
export async function processBatch(db: Pool, limit = 2) {
  await backfill(db);
  // The lease token prevents a stale worker from publishing after reprocessing.
  for (let n = 0; n < Math.min(limit, 10); n++) {
    const token = randomUUID();
    const job = (
      await db.query<{ ride_id: string }>(
        `UPDATE ride_similarity_index SET status='processing',lease_until=now()+interval '2 minutes',attempts=attempts+1,quality=jsonb_build_object('token',$1::text) WHERE ride_id=(SELECT s.ride_id FROM ride_similarity_index s JOIN rides r ON r.id=s.ride_id WHERE r.deleted_at IS NULL AND ((s.status='queued' AND s.next_attempt<=now()) OR (s.status='processing' AND s.lease_until<now())) ORDER BY s.next_attempt,s.ride_id FOR UPDATE OF s SKIP LOCKED LIMIT 1) RETURNING ride_id`,
        [token],
      )
    ).rows[0];
    if (!job) break;
    const deadline = performance.now() + 20000;
    try {
      const { gps } = await prepared(db, job.ride_id);
      const geometry = gps.reason
        ? null
        : {
            type: 'MultiLineString',
            coordinates: gps.segments.map((s) => searchLine(s).coordinates),
          };
      const updated = await db.query(
        `UPDATE ride_similarity_index SET geometry=CASE WHEN $2::text IS NULL THEN NULL ELSE public.ST_GeomFromGeoJSON($2)::public.geography END,valid_meters=$3,version=$4,quality=$5::jsonb,indexed_at=now(),region_id=(SELECT id FROM similarity_regions WHERE $2::text IS NOT NULL AND public.ST_Covers(boundary,public.ST_GeomFromGeoJSON($2)) ORDER BY id LIMIT 1) WHERE ride_id=$1 AND quality->>'token'=$6 RETURNING ride_id`,
        [
          job.ride_id,
          geometry ? JSON.stringify(geometry) : null,
          gps.meters,
          RULES.version,
          JSON.stringify({
            token,
            reason: gps.reason,
            rejected: gps.rejected,
            interrupted: gps.interrupted,
          }),
          token,
        ],
      );
      if (!updated.rowCount) continue;
      await db.query(`DELETE FROM ride_similarity_matches WHERE a=$1 OR b=$1`, [
        job.ride_id,
      ]);
      const rows = geometry ? await candidates(db, job.ride_id) : [];
      let processed = 0;
      for (const row of rows.slice(0, RULES.maxCandidates)) {
        if (performance.now() > deadline) break;
        const [a, b] = [job.ride_id, row.ride_id].sort() as [string, string];
        const left = await prepared(db, a),
          right = await prepared(db, b);
        const result = recognize(
          left.gps,
          right.gps,
          right.row.active_intervals,
          right.row.started_at.getTime(),
        );
        processed++;
        if (result.classification === 'none') continue;
        // Live access at commit also prevents stale processing after revocation.
        await db.query(
          `INSERT INTO ride_similarity_matches(a,b,version,result) SELECT $1,$2,$3,$4::jsonb FROM rides a JOIN rides b ON b.id=$2 JOIN ride_similarity_index s ON s.ride_id=$5 JOIN users au ON au.id=a.owner_id JOIN users bu ON bu.id=b.owner_id JOIN privacy_settings ap ON ap.user_id=a.owner_id JOIN privacy_settings bp ON bp.user_id=b.owner_id WHERE a.id=$1 AND a.deleted_at IS NULL AND b.deleted_at IS NULL AND s.quality->>'token'=$6 AND (a.owner_id=b.owner_id OR (a.comparison_enabled AND b.comparison_enabled AND a.visibility='public' AND b.visibility='public' AND ap.profile_visibility='public' AND bp.profile_visibility='public' AND au.account_status='active' AND bu.account_status='active')) ON CONFLICT(a,b) DO UPDATE SET version=EXCLUDED.version,result=EXCLUDED.result,calculated_at=now()`,
          [a, b, RULES.version, JSON.stringify(result), job.ride_id, token],
        );
      }
      await db.query(
        `UPDATE ride_similarity_index SET status=$2,lease_until=NULL,candidate_count=$3,truncated=$4 WHERE ride_id=$1 AND quality->>'token'=$5`,
        [
          job.ride_id,
          gps.reason ? 'insufficient' : 'done',
          processed,
          rows.length > processed,
          token,
        ],
      );
    } catch {
      // No coordinates, identifiers or raw database errors in diagnostics.
      await db.query(
        `UPDATE ride_similarity_index SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'error' END,next_attempt=now()+interval '1 minute',lease_until=NULL,quality=jsonb_build_object('reason','Falha ou timeout de análise. Tente reprocessar.') WHERE ride_id=$1 AND quality->>'token'=$2`,
        [job.ride_id, token],
      );
    }
  }
}
export function startWorker(db: Pool) {
  let active: Promise<void> | undefined,
    stopped = false;
  const tick = () => {
    if (!stopped && !active)
      active = processBatch(db)
        .catch(() => {})
        .finally(() => {
          active = undefined;
        });
  };
  const timer = setInterval(tick, 1000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}
