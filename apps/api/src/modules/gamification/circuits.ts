import type { Pool } from 'pg';
import { AuthError } from '../auth/validation.js';
import { fields } from '../events/validation.js';
import { page } from './queries.js';

export async function circuitResults(
  db: Pool,
  who: string,
  circuit: string,
  raw: unknown,
) {
  const q = fields(raw ?? {}, ['page']),
    p = page(q.page);
  const route = (
    await db.query(
      "SELECT id,kind,verification,status,version FROM routes WHERE id=$1 AND (status='approved' OR owner_id=$2)",
      [circuit, who],
    )
  ).rows[0];
  if (!route || route.kind !== 'circuit')
    throw new AuthError(404, 'Circuito indisponível.');
  const items = (
    await db.query(
      `SELECT r.id AS ride_id,r.route_version,r.started_at,r.route_snapshot->>'direction' AS direction,f.category,l.lap_number,round(l.duration_ms/1000.0,1)::float8 AS estimated_seconds,l.quality,
 (f.circuit AND NOT EXISTS(SELECT 1 FROM admin_result_states ax WHERE ax.ride_id=r.id) AND r.route_version=$3 AND $4::boolean AND l.quality->>'method'='gps-line-intersection-v1' AND (l.quality->>'accuracy')::float8<=20) AS technically_eligible
 FROM ride_laps l JOIN rides r ON r.id=l.ride_id LEFT JOIN gamification_ride_facts f ON f.ride_id=r.id
 WHERE r.owner_id=$1 AND r.route_id=$2 AND r.deleted_at IS NULL ORDER BY r.started_at DESC,r.id,l.lap_number LIMIT 21 OFFSET $5`,
      [
        who,
        circuit,
        route.version,
        route.status === 'approved' && route.verification === 'verified',
        (p - 1) * 20,
      ],
    )
  ).rows;
  return {
    items: items.slice(0, 20),
    hasMore: items.length > 20,
    publicEntries: [],
    official: false,
    experimentalAvailable: false,
    reason:
      'Resultados pessoais estimados por GPS. Classificação pública aguarda validação técnica de precisão, geometria e sentido; nenhum resultado homologado.',
  };
}
