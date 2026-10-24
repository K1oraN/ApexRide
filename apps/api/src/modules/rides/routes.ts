import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { AuthError } from '../auth/validation.js';
import { uuid } from './validation.js';
import { persistRide } from './persist.js';
import { registerSyncRoutes } from './sync-routes.js';
import { registerHistory } from './history.js';
import { historySummary } from './history-data.js';

export async function rideRoutes(
  app: FastifyInstance,
  options: { config: Config; pool?: Pool | undefined },
) {
  const db = () => {
    if (!options.pool) throw new AuthError(503, 'Serviço indisponível.');
    return options.pool;
  };
  const principal = createPrincipal(options.config, db);
  app.addHook('onRequest', sessionGuard(options.config));
  app.addHook('onRequest', async (request) => {
    await principal(request, request.method !== 'GET');
  });
  registerSyncRoutes(app, db, principal);
  registerHistory(app, db, principal);
  app.post(
    '/rides',
    { bodyLimit: 32 * 1024 * 1024 },
    async (request, reply) => {
      const { user } = await principal(request, true);
      const { created, ...result } = await persistRide(
        db(),
        user.id,
        request.body,
      );
      reply.code(created ? 201 : 200);
      return result;
    },
  );
  app.get('/rides/:id', async (request) => {
    const { user } = await principal(request);
    const id = (request.params as { id: string }).id;
    if (!uuid(id)) throw new AuthError(404, 'Atividade não encontrada.');
    const query = request.query as { view?: string };
    if (query.view === 'summary') return historySummary(db(), id, user.id);
    if (query.view !== undefined)
      throw new AuthError(400, 'Visualização inválida.');
    const result = await db().query(
      'SELECT * FROM rides WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',
      [id, user.id],
    );
    const ride = result.rows[0];
    const speedProcessing = ride?.speed_processing ?? null;
    const telemetrySummary = ride?.telemetry_summary ?? null;
    if (ride) {
      delete ride.request_hash;
      delete ride.speed_processing;
      delete ride.telemetry_summary;
    }
    if (!ride?.id) throw new AuthError(404, 'Atividade não encontrada.');
    const events = telemetrySummary
      ? await db().query(
          `SELECT id,type,start_ms::float8 AS "startMs",end_ms::float8 AS "endMs",duration_ms::float8 AS "durationMs",status,reason,method,version,quality,force FROM ride_performance_events WHERE ride_id=$1 ORDER BY start_ms,type`,
          [id],
        )
      : null;
    const points = await db().query(
      `SELECT point_order,public.ST_Y(position::public.geometry) AS latitude,public.ST_X(position::public.geometry) AS longitude,
      recorded_at,accuracy,speed,heading,altitude,segment,source,quality FROM ride_points WHERE ride_id=$1 ORDER BY point_order`,
      [id],
    );
    const motion = await db().query(
      'SELECT version,calibration,stats,gaps,truncated FROM ride_motion WHERE ride_id=$1',
      [id],
    );
    const samples = motion.rowCount
      ? await db().query(
          'SELECT sequence,relative_ms,event_timestamp,segment,longitudinal,acceleration_g,braking_g,lean,quality,source FROM ride_motion_samples WHERE ride_id=$1 ORDER BY relative_ms',
          [id],
        )
      : null;
    return {
      status: 'ok',
      ride,
      speedProcessing,
      telemetry: telemetrySummary
        ? { ...telemetrySummary, events: events?.rows ?? [] }
        : null,
      points: points.rows,
      motion: motion.rows[0]
        ? { ...motion.rows[0], samples: samples?.rows ?? [] }
        : null,
    };
  });
}
