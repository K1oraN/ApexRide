import { activeSanction } from '../admin/sanctions.js';
import type { Pool } from 'pg';
import { AuthError } from '../auth/validation.js';
import { notBlocked } from '../social/block-policy.js';
import { fields } from '../events/validation.js';
import { BIKE_CATEGORIES } from '@apex-ride/ride-core/comparison';
import { levelFor } from './rules.js';

export async function progress(db: Pool, who: string) {
  const row = (
    await db.query(
      `SELECT p.lifetime_xp,p.updated_at,EXISTS(SELECT 1 FROM gamification_jobs j WHERE j.user_id=$1) AS pending,
 (SELECT count(*)::int FROM gamification_ride_facts f JOIN rides r ON r.id=f.ride_id WHERE f.user_id=$1 AND f.state='eligible' AND r.deleted_at IS NULL) AS valid_rides
 FROM (SELECT $1::uuid AS id) u LEFT JOIN user_progress p ON p.user_id=u.id`,
      [who],
    )
  ).rows[0];
  const config = (
    await db.query(
      'SELECT * FROM xp_level_config ORDER BY version DESC LIMIT 1',
    )
  ).rows[0];
  return {
    ...levelFor(
      Number(row.lifetime_xp ?? 0),
      config.thresholds,
      config.extension_step,
    ),
    version: config.version,
    updatedAt: row.updated_at,
    pending: row.pending,
    validRides: row.valid_rides,
  };
}
export async function achievements(db: Pool, who: string) {
  return (
    await db.query(
      `SELECT d.code,d.name,d.description,d.category,d.icon,d.target,d.version,d.enabled,COALESCE(a.current_value,0) AS current_value,CASE WHEN NOT d.enabled THEN 'unavailable' ELSE CASE WHEN EXISTS(SELECT 1 FROM admin_achievement_states ax WHERE ax.user_id=$1 AND ax.achievement_code=d.code) THEN 'revoked' ELSE COALESCE(a.status,'locked') END END AS status,a.unlocked_at,
 COALESCE((SELECT xp_amount FROM xp_rules r WHERE r.code=d.reward_rule ORDER BY version DESC LIMIT 1),0) AS xp_reward
 FROM achievement_definitions d LEFT JOIN user_achievements a ON a.achievement_code=d.code AND a.user_id=$1 ORDER BY d.category,d.target,d.code`,
      [who],
    )
  ).rows;
}
export const categories = [...BIKE_CATEGORIES];
export const bands = [
  'unknown',
  'up-to-300',
  '301-600',
  '601-1000',
  'over-1000',
];
export const regions: Record<string, string[]> = {
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
export const states = Object.values(regions).flat();
export function page(value: unknown) {
  const n = Number(value ?? 1);
  if (!Number.isSafeInteger(n) || n < 1 || n > 1000)
    throw new AuthError(400, 'Página inválida.');
  return n;
}
export function rankingQuery(raw: unknown) {
  const q = fields(raw ?? {}, [
    'season',
    'kind',
    'state',
    'city',
    'region',
    'category',
    'ccBand',
    'page',
  ]);
  const str = (k: string, max = 80) => {
    const v = q[k] ?? '';
    if (typeof v !== 'string' || v.length > max)
      throw new AuthError(400, 'Filtro inválido.');
    return v.trim();
  };
  const season = str('season', 7),
    kind = str('kind') || 'xp',
    state = str('state', 2),
    city = str('city'),
    region = str('region'),
    category = str('category'),
    ccBand = str('ccBand');
  if (
    (season && !/^\d{4}-\d{2}$/.test(season)) ||
    !['xp', 'community', 'exploration'].includes(kind) ||
    (state && !states.includes(state)) ||
    (region && !regions[region]) ||
    (category && !categories.includes(category)) ||
    (ccBand && !bands.includes(ccBand)) ||
    (city && !state)
  )
    throw new AuthError(400, 'Filtros inválidos.');
  return {
    season,
    kind,
    state,
    city,
    region,
    category,
    ccBand,
    page: page(q.page),
  };
}
export async function leaderboard(
  db: Pool,
  who: string,
  q: ReturnType<typeof rankingQuery>,
) {
  const season = (
    await db.query(
      `SELECT * FROM leaderboard_seasons WHERE ${q.season ? 'id=$1' : "status='active' AND starts_at<=now() AND ends_at>now()"} ORDER BY starts_at DESC LIMIT 1`,
      q.season ? [q.season] : [],
    )
  ).rows[0];
  if (!season)
    return {
      items: [],
      me: null,
      hasMore: false,
      unavailable: 'Temporada indisponível.',
      season: null,
    };
  if (season.status === 'scheduled')
    return {
      items: [],
      me: null,
      hasMore: false,
      unavailable: 'Temporada ainda não iniciada.',
      season,
    };
  const values = [
    who,
    season.id,
    q.kind,
    q.state,
    q.city,
    q.category,
    q.ccBand,
    q.region ? regions[q.region] : null,
  ];
  const cte = `WITH totals AS (
 SELECT s.user_id,sum(s.score)::float8 AS score FROM leaderboard_scores s JOIN leaderboard_participation p ON p.user_id=s.user_id JOIN users u ON u.id=s.user_id JOIN privacy_settings ps ON ps.user_id=s.user_id
 WHERE s.season_id=$2 AND s.kind=$3 AND p.opted_in AND u.account_status='active' AND ps.profile_visibility='public'
 AND NOT EXISTS(SELECT 1 FROM admin_ranking_entries ax WHERE ax.user_id=s.user_id AND ax.season_id=s.season_id)
 AND NOT ${activeSanction('s.user_id', 'rankings')} AND NOT EXISTS(SELECT 1 FROM gamification_jobs j WHERE j.user_id=s.user_id)
 AND ${notBlocked('s.user_id')} AND ($4='' OR p.state=$4) AND ($5='' OR lower(p.city)=lower($5)) AND ($6='' OR s.category=$6) AND ($7='' OR s.displacement_band=$7) AND ($8::text[] IS NULL OR p.state=ANY($8::text[]))
 GROUP BY s.user_id HAVING sum(s.score)>0), ranked AS (SELECT *,rank() OVER(ORDER BY score DESC)::int AS position FROM totals)`;
  const count = Number(
    (await db.query(`${cte} SELECT count(*)::int AS total FROM ranked`, values))
      .rows[0].total,
  );
  if ((q.state || q.city || q.region) && count < 5)
    return {
      items: [],
      me: null,
      hasMore: false,
      unavailable:
        'São necessários pelo menos cinco participantes elegíveis nesta região.',
      season,
    };
  // Conta e página compartilham a mesma política de consentimento; sem caches públicos.
  const rows = (
    await db.query(
      `${cte} SELECT r.user_id,u.username,u.display_name,r.score,r.position,p.state,p.city FROM ranked r JOIN users u ON u.id=r.user_id JOIN leaderboard_participation p ON p.user_id=r.user_id ORDER BY r.score DESC,r.user_id LIMIT 21 OFFSET $9`,
      [...values, (q.page - 1) * 20],
    )
  ).rows;
  const me =
    (
      await db.query(
        `${cte} SELECT score,position FROM ranked WHERE user_id=$1`,
        values,
      )
    ).rows[0] ?? null;
  return {
    items: rows.slice(0, 20),
    hasMore: rows.length > 20,
    me,
    season,
    unavailable: null,
  };
}
