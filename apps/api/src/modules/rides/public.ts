import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { AuthError } from '../auth/validation.js';
import { uuid } from './validation.js';
import type { Config } from '../../config/env.js';
import { createPrincipal } from '../auth/session.js';
import { notBlocked } from '../social/policy.js';
export async function publicRideRoutes(
  app: FastifyInstance,
  options: { pool?: Pool | undefined; config: Config },
) {
  const limits = new Map<string, { at: number; count: number }>();
  const timer = setInterval(() => {
    for (const [key, value] of limits)
      if (value.at < Date.now() - 60000) limits.delete(key);
  }, 60000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store, private, max-age=0');
    reply.header('Pragma', 'no-cache');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Robots-Tag', 'noindex, noarchive');
    reply.header('Vary', 'Cookie');
    const now = Date.now();
    let value = limits.get(req.ip);
    if (!value || value.at < now - 60000) {
      value = { at: now, count: 0 };
      limits.set(req.ip, value);
    }
    if (++value.count > 60)
      throw new AuthError(
        429,
        'Aguarde um minuto antes de consultar novamente.',
      );
  });
  app.get('/public/rides/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    if (!uuid(id)) throw new AuthError(404, 'Resumo público indisponível.');
    if (!options.pool) throw new AuthError(503, 'Serviço indisponível.');
    let viewer: string | null = null;
    try {
      viewer = (await createPrincipal(options.config, () => options.pool!)(req))
        .user.id;
    } catch (error) {
      if (!(error instanceof AuthError && error.statusCode === 401))
        throw error;
    }
    // Explicit whitelist: no custom title/description, coordinates, exact times, route, bike or telemetry.
    const row = (
      await options.pool.query(
        `SELECT u.display_name AS rider,r.mode,to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') AS day,round((r.distance_meters/1000)::numeric,1)::float8 AS distance_km,round(r.active_ms/60000.0)::int AS active_minutes FROM rides r JOIN users u ON u.id=r.owner_id JOIN privacy_settings p ON p.user_id=r.owner_id WHERE r.id=$1 AND r.deleted_at IS NULL AND r.visibility='public' AND p.profile_visibility='public' AND u.account_status='active' AND ${notBlocked('u.id', '$2')}`,
        [id, viewer],
      )
    ).rows[0];
    if (!row) throw new AuthError(404, 'Resumo público indisponível.');
    return {
      status: 'ok',
      summary: {
        ...row,
        title: `${row.mode === 'pista' ? 'Pista' : row.mode === 'misto' ? 'Misto' : 'Passeio'} — ${row.day}`,
        locationPolicy: 'summary-only-v1',
      },
    };
  });
}
