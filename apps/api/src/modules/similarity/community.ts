import type { Pool } from 'pg';
import { AuthError } from '../auth/validation.js';
import {
  bikeFilters,
  categoryJoin,
  comparisonConfig,
  comparisonQuery,
  publicConsent,
} from '../comparisons/policy.js';
import { RULES } from './geometry.js';

/** Safe fallback: disjoint regional aggregates, no public geometry or anchor ID. */
export async function communityDiscovery(
  db: Pool,
  query: Record<string, unknown>,
) {
  const { regionId, ...filters } = query;
  if (typeof regionId !== 'string' || regionId.length > 80 || !regionId)
    throw new AuthError(400, 'Selecione uma região administrativa disponível.');
  if (Object.keys(filters).some((k) => !['category', 'ccBand'].includes(k)))
    throw new AuthError(
      400,
      'Consulta comunitária usa somente região, categoria e faixa fixas.',
    );
  const q = comparisonQuery(filters),
    min = comparisonConfig().minParticipants;
  if (!q.category || q.ccBand < 0)
    throw new AuthError(400, 'Selecione categoria e faixa de cilindrada.');
  const values: unknown[] = [regionId, RULES.version],
    bike = bikeFilters(q, values);
  values.push(min);
  const row = (
    await db.query(
      `WITH eligible AS (
    SELECT r.id,r.owner_id,s.region_id FROM rides r JOIN ride_similarity_index s ON s.ride_id=r.id JOIN users u ON u.id=r.owner_id JOIN privacy_settings ps ON ps.user_id=r.owner_id ${categoryJoin}
    WHERE s.region_id=$1 AND s.version=$2 AND s.status='done' AND ${publicConsent} ${bike}
  ), per_owner AS (
    SELECT e.owner_id,avg((m.result->>'sharedMeters')::float8) AS meters FROM eligible e JOIN ride_similarity_matches m ON (m.a=e.id OR m.b=e.id)
    JOIN eligible other ON other.id=CASE WHEN m.a=e.id THEN m.b ELSE m.a END AND other.owner_id<>e.owner_id
    WHERE m.version=$2 AND m.result->>'classification'='full' GROUP BY e.owner_id
  ) SELECT round((avg(meters)/1000)::numeric)::float8 AS "approximateKm" FROM per_owner HAVING count(*) >= $${values.length}`,
      values,
    )
  ).rows[0];
  return row
    ? {
        available: true,
        summary: row,
        minParticipants: min,
        policy: 'regional-disjoint-v1',
        message:
          'Existem trajetos compartilhados autorizados nesta região. Extensão aproximada; nenhum trajeto individual é publicado.',
      }
    : {
        available: false,
        minParticipants: min,
        message: 'Dados insuficientes para descoberta comunitária.',
      };
}
