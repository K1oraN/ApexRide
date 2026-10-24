import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { AuthError } from '../auth/validation.js';
import { validateRide } from './validation.js';
import { persistRouteAssociation } from '../routes/ride-plan.js';
import { reconcileUser } from '../gamification/engine.js';

export async function persistRide(pool: Pool, ownerId: string, value: unknown) {
  const { payload: b, metrics: m } = validateRide(value);
  const hash = createHash('sha256').update(JSON.stringify(b)).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializa com arquivamento da garagem e alterações da conta.
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
      ownerId,
    ]);
    if (
      (
        await client.query(
          'SELECT client_id FROM ride_deletions WHERE owner_id=$1 AND client_id=$2',
          [ownerId, b.clientId],
        )
      ).rowCount
    )
      throw new AuthError(
        410,
        'Esta atividade foi excluída. O envio foi cancelado.',
      );
    const existing = await client.query(
      'SELECT id,request_hash,deleted_at FROM rides WHERE owner_id=$1 AND client_id=$2',
      [ownerId, b.clientId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].deleted_at)
        throw new AuthError(
          410,
          'Esta atividade foi excluída e não pode ser recriada pela sincronização.',
        );
      if (existing.rows[0].request_hash !== hash)
        throw new AuthError(
          409,
          'Este identificador já foi salvo com outros dados.',
        );
      await client.query('COMMIT');
      return {
        status: 'ok',
        id: existing.rows[0].id,
        metrics: m,
        created: false,
      };
    }
    const bike = await client.query(
      'SELECT id,brand,model,year,displacement_cc FROM motorcycles WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR UPDATE',
      [b.motorcycleId, ownerId],
    );
    if (!bike.rowCount)
      throw new AuthError(404, 'Moto não encontrada na sua garagem.');
    const id = randomUUID();
    await client.query(
      `INSERT INTO rides(id,client_id,request_hash,owner_id,motorcycle_id,mode,visibility,started_at,ended_at,active_ms,paused_ms,distance_meters,average_kmh,maximum_kmh,active_intervals,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,clock_timestamp(),clock_timestamp())`,
      [
        id,
        b.clientId,
        hash,
        ownerId,
        b.motorcycleId,
        b.mode,
        b.visibility,
        new Date(b.startedAt),
        new Date(b.endedAt),
        m.activeMs,
        m.pausedMs,
        m.distanceMeters,
        m.averageKmh,
        m.maximumKmh,
        JSON.stringify(b.intervals),
      ],
    );
    const motorcycle = bike.rows[0];
    await client.query('UPDATE rides SET motorcycle_snapshot=$1 WHERE id=$2', [
      JSON.stringify({
        brand: motorcycle.brand,
        model: motorcycle.model,
        year: motorcycle.year,
        displacementCc: motorcycle.displacement_cc,
        historicalFallback: false,
      }),
      id,
    ]);
    // Lotes limitados, todos dentro da mesma transação. Não gera 50 mil round trips.
    for (let offset = 0; offset < b.points.length; offset += 1_000) {
      await client.query(
        `INSERT INTO ride_points(ride_id,point_order,position,recorded_at,accuracy,speed,heading,altitude,segment)
          SELECT $1, $2::integer + (p.ordinality-1)::integer,
          public.ST_SetSRID(public.ST_MakePoint((p.value->>'longitude')::float8,(p.value->>'latitude')::float8),4326)::public.geography,
          to_timestamp((p.value->>'timestamp')::float8/1000),
          (p.value->>'accuracy')::float8,(p.value->>'speed')::float8,(p.value->>'heading')::float8,(p.value->>'altitude')::float8,(p.value->>'segment')::integer
          FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY p(value,ordinality)`,
        [id, offset, JSON.stringify(b.points.slice(offset, offset + 1_000))],
      );
    }
    if (b.motion) {
      await client.query(
        'INSERT INTO ride_motion(ride_id,version,calibration,stats,gaps,truncated) VALUES($1,$2,$3,$4,$5,$6)',
        [
          id,
          b.motion.version,
          JSON.stringify(b.motion.calibration),
          JSON.stringify(b.motion.stats),
          JSON.stringify(b.motion.gaps),
          b.motion.truncated,
        ],
      );
      for (let offset = 0; offset < b.motion.samples.length; offset += 1000) {
        await client.query(
          `INSERT INTO ride_motion_samples(ride_id,sequence,relative_ms,event_timestamp,segment,longitudinal,acceleration_g,braking_g,lean,quality,source)
              SELECT $1,(s->>'sequence')::integer,(s->>'relativeMs')::bigint,(s->>'eventTimestamp')::float8,(s->>'segment')::integer,(s->>'longitudinal')::float8,(s->>'accelerationG')::float8,(s->>'brakingG')::float8,NULL,s->>'quality',s->>'source' FROM jsonb_array_elements($2::jsonb) s`,
          [id, JSON.stringify(b.motion.samples.slice(offset, offset + 1000))],
        );
      }
    }
    if (b.speedProcessing)
      await client.query('UPDATE rides SET speed_processing=$1 WHERE id=$2', [
        JSON.stringify(b.speedProcessing),
        id,
      ]);
    if (b.telemetry) {
      const { events, ...summary } = b.telemetry;
      await client.query('UPDATE rides SET telemetry_summary=$1 WHERE id=$2', [
        JSON.stringify(summary),
        id,
      ]);
      await client.query(
        `INSERT INTO ride_performance_events(ride_id,id,type,start_ms,end_ms,duration_ms,status,reason,method,version,quality,force)
            SELECT $1,e->>'id',e->>'type',(e->>'startMs')::bigint,(e->>'endMs')::bigint,(e->>'durationMs')::bigint,e->>'status',e->>'reason',e->>'method',e->>'version',e->'quality',NULLIF(e->'force','null'::jsonb)
            FROM jsonb_array_elements($2::jsonb) e`,
        [id, JSON.stringify(events)],
      );
    }
    await persistRouteAssociation(client, id, b);
    if (b.event) {
      const authorization = await client.query(
        'SELECT id FROM event_ride_authorizations WHERE id=$1 AND event_id=$2 AND user_id=$3 AND created_at<=$4 AND expires_at>=$4',
        [b.event.authorizationId, b.event.id, ownerId, new Date(b.startedAt)],
      );
      if (!authorization.rowCount)
        throw new AuthError(
          403,
          'Associação com evento não autorizada no início deste Ride.',
        );
      await client.query('UPDATE rides SET event_id=$2 WHERE id=$1', [
        id,
        b.event.id,
      ]);
    }
    await reconcileUser(client, ownerId);
    await client.query('COMMIT');
    return { status: 'ok', id, metrics: m, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
