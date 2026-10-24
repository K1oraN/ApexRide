import type { Pool, PoolClient } from 'pg';
import { transaction } from '../groups/store.js';
import { qualityState, displacementBand } from './rules.js';

type Db = Pick<PoolClient, 'query'>;
type Rule = {
  code: string;
  version: number;
  description: string;
  xp_amount: number;
  daily_limit: number;
  enabled: boolean;
};
type Award = {
  key: string;
  rule: string;
  type: string;
  source: string;
  at: Date;
  category: string;
  band: string;
};

export async function ensureSeasons(db: Db) {
  // Limites mensais calculados no servidor, fuso de produto explicitamente fixado.
  await db.query(`INSERT INTO leaderboard_seasons(id,name,starts_at,ends_at,status)
 SELECT to_char(d,'YYYY-MM'),'Temporada '||to_char(d,'MM/YYYY'),d AT TIME ZONE 'America/Sao_Paulo',
 (d+interval '1 month') AT TIME ZONE 'America/Sao_Paulo',CASE WHEN d>clock_timestamp() AT TIME ZONE 'America/Sao_Paulo' THEN 'scheduled' ELSE 'active' END
 FROM generate_series(date_trunc('month',clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')-interval '1 month',date_trunc('month',clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')+interval '1 month',interval '1 month') d
 ON CONFLICT DO NOTHING`);
  await db.query(
    `UPDATE leaderboard_seasons SET status='closed',closed_at=clock_timestamp() WHERE ends_at<=clock_timestamp() AND status IN ('active','scheduled')`,
  );
  await db.query(
    `UPDATE leaderboard_seasons SET status='active' WHERE starts_at<=clock_timestamp() AND ends_at>clock_timestamp() AND status='scheduled'`,
  );
}

export async function evaluateRides(db: Db, who: string, limit = 100) {
  const rows = (
    await db.query(
      `SELECT r.*,mc.category,decision.eligible AS decision,
 (SELECT count(*)::int FROM ride_points p WHERE p.ride_id=r.id) AS points,
 (SELECT avg(accuracy) FROM ride_points p WHERE p.ride_id=r.id) AS accuracy,
 (SELECT COALESCE(sum(CASE WHEN gap BETWEEN 0 AND 30000 AND segment=prev_segment THEN gap ELSE 0 END),0)::float8 FROM
  (SELECT segment,lag(segment) OVER w AS prev_segment,extract(epoch FROM recorded_at-lag(recorded_at) OVER w)*1000 AS gap FROM ride_points WHERE ride_id=r.id WINDOW w AS (ORDER BY point_order)) p) AS coverage_ms,
 (SELECT COALESCE(max(gap),0)::float8 FROM (SELECT CASE WHEN segment=lag(segment) OVER w THEN extract(epoch FROM recorded_at-lag(recorded_at) OVER w)*1000 ELSE 0 END AS gap FROM ride_points WHERE ride_id=r.id WINDOW w AS (ORDER BY point_order)) p) AS max_gap,
 EXISTS(SELECT 1 FROM rides other WHERE other.owner_id=r.owner_id AND other.id<>r.id AND other.deleted_at IS NULL AND other.active_ms>=60000 AND other.distance_meters>=100 AND other.created_at<=r.created_at AND (other.created_at<r.created_at OR other.id<r.id) AND other.started_at<r.ended_at AND other.ended_at>r.started_at) AS overlap,
 v.plan AS approved_plan,v.verified_at,rt.status AS route_status,rt.verification AS current_verification,
 md5(least((v.plan->'geometry'->'coordinates')::text,(SELECT jsonb_agg(p.value ORDER BY p.n DESC)::text FROM jsonb_array_elements(v.plan->'geometry'->'coordinates') WITH ORDINALITY p(value,n)))) AS geometry_key
 FROM rides r LEFT JOIN gamification_ride_facts f ON f.ride_id=r.id
 LEFT JOIN gamification_ride_decisions decision ON decision.ride_id=r.id
 LEFT JOIN motorcycle_model_categories mc ON lower(mc.brand)=lower(r.motorcycle_snapshot->>'brand') AND lower(mc.model)=lower(r.motorcycle_snapshot->>'model')
 LEFT JOIN route_versions v ON v.route_id=r.route_id AND v.version=r.route_version LEFT JOIN routes rt ON rt.id=r.route_id
 WHERE r.owner_id=$1 AND (f.ride_id IS NULL OR f.evaluated_at<r.updated_at OR (r.deleted_at IS NOT NULL AND f.state<>'revoked'))
 ORDER BY r.created_at,r.id LIMIT $2`,
      [who, limit],
    )
  ).rows;
  for (const r of rows) {
    let q: {
      state: 'eligible' | 'pending' | 'ineligible' | 'revoked';
      reason: string;
    } = qualityState({
      activeMs: Number(r.active_ms),
      distance: r.distance_meters,
      points: r.points,
      accuracy: Number(r.accuracy ?? 100),
      coverage: Number(r.coverage_ms) / Math.max(1, Number(r.active_ms)),
      maxGap: Number(r.max_gap),
      deleted: !!r.deleted_at,
      overlap: r.overlap,
      future: r.ended_at.getTime() > r.created_at.getTime() + 60_000,
    });
    if (!r.deleted_at && r.decision === false)
      q = {
        state: 'ineligible',
        reason: 'Concessão corrigida após revisão de integridade.',
      };
    if (!r.deleted_at && r.decision === true && q.state === 'pending')
      q = {
        state: 'eligible',
        reason: 'Atividade validada após revisão de integridade.',
      };
    const routeKey =
      q.state === 'eligible' &&
      r.route_status === 'approved' &&
      r.route_result?.completion === 'completed'
        ? r.geometry_key
        : null;
    const circuit =
      q.state === 'eligible' &&
      r.approved_plan?.kind === 'circuit' &&
      r.current_verification === 'verified' &&
      !!r.verified_at &&
      r.route_status === 'approved' &&
      r.started_at >= r.verified_at &&
      r.mode === 'pista' &&
      Number(r.max_gap) <= 5000 &&
      Number(r.accuracy) <= 20 &&
      routeKey !== null;
    await db.query(
      `INSERT INTO gamification_ride_facts(ride_id,user_id,state,reason,route_key,circuit,category,displacement_band) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(ride_id) DO UPDATE SET state=$3,reason=$4,route_key=$5,circuit=$6,evaluated_at=clock_timestamp()`,
      [
        r.id,
        who,
        q.state,
        q.reason,
        routeKey,
        circuit,
        r.category ?? 'Não classificada',
        displacementBand(r.motorcycle_snapshot?.displacementCc),
      ],
    );
    if (q.state === 'pending')
      await db.query(
        `INSERT INTO gamification_reviews(user_id,source_type,source_id,reason) VALUES($1,'ride',$2,$3) ON CONFLICT DO NOTHING`,
        [who, r.id, q.reason],
      );
  }
  return rows.length === limit;
}

export async function reconcileUser(
  db: Db,
  who: string,
  limit = 100,
  actor = 'gamification-v1',
) {
  await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [who]);
  const revision = (
    await db.query('SELECT revision FROM gamification_jobs WHERE user_id=$1', [
      who,
    ])
  ).rows[0]?.revision;
  await ensureSeasons(db);
  const more = await evaluateRides(db, who, limit);
  // Exclusão invalida imediatamente os fatos já avaliados, mesmo em backfill extenso.
  await db.query(
    `UPDATE gamification_ride_facts f SET state='revoked',reason='Atividade excluída.' FROM rides r WHERE r.id=f.ride_id AND f.user_id=$1 AND r.deleted_at IS NOT NULL AND f.state<>'revoked'`,
    [who],
  );
  const rules = (
    await db.query<Rule>(
      'SELECT DISTINCT ON(code) * FROM xp_rules ORDER BY code,version DESC',
    )
  ).rows;
  const facts = (
    await db.query(
      `SELECT f.*,r.created_at,r.mode FROM gamification_ride_facts f JOIN rides r ON r.id=f.ride_id WHERE f.user_id=$1 AND f.state='eligible' AND r.deleted_at IS NULL ORDER BY r.created_at,r.id`,
      [who],
    )
  ).rows;
  const attendance = (
    await db.query(
      `SELECT a.event_id,a.verified_at,e.event_type FROM event_attendance a JOIN social_events e ON e.id=a.event_id WHERE a.user_id=$1 AND a.revoked_at IS NULL AND e.status<>'cancelled' AND e.ends_at<=clock_timestamp() ORDER BY a.verified_at,a.event_id`,
      [who],
    )
  ).rows;
  const bikes = Number(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM motorcycles WHERE owner_id=$1',
        [who],
      )
    ).rows[0].n,
  );
  const desired: Award[] = [];
  const add = (
    rule: string,
    key: string,
    type: string,
    source: string,
    at: Date,
    category = 'Não classificada',
    band = 'unknown',
  ) => desired.push({ rule, key, type, source, at, category, band });
  if (facts[0])
    add(
      'first_ride',
      'first_ride',
      'ride',
      facts[0].ride_id,
      facts[0].created_at,
      facts[0].category,
      facts[0].displacement_band,
    );
  const routes = new Set<string>();
  const routeReceipts: Date[] = [];
  for (const f of facts) {
    add(
      'ride',
      `ride:${f.ride_id}`,
      'ride',
      f.ride_id,
      f.created_at,
      f.category,
      f.displacement_band,
    );
    if (f.route_key && !routes.has(f.route_key)) {
      const rule = routes.size === 0 ? 'first_route' : 'route';
      routes.add(f.route_key);
      routeReceipts.push(f.created_at);
      add(
        rule,
        `route:${f.route_key}`,
        'ride',
        f.ride_id,
        f.created_at,
        f.category,
        f.displacement_band,
      );
    }
  }
  for (const a of attendance)
    add('event', `event:${a.event_id}`, 'event', a.event_id, a.verified_at);
  const metrics: Record<string, number> = {
    rides: facts.length,
    routes: routes.size,
    events: attendance.length,
    bikes,
    groupRides: attendance.filter((a) => a.event_type === 'ride').length,
    circuits: facts.filter((f) => f.circuit).length,
  };
  const definitions = (
    await db.query('SELECT * FROM achievement_definitions ORDER BY code')
  ).rows;
  for (const a of definitions) {
    const value = metrics[a.metric] ?? 0,
      unlocked = a.enabled && value >= a.target;
    await db.query(
      `INSERT INTO user_achievements(user_id,achievement_code,current_value,status,unlocked_at,awarded_version) VALUES($1,$2,$3,$4,CASE WHEN $4='unlocked' THEN now() END,$5)
   ON CONFLICT(user_id,achievement_code) DO UPDATE SET current_value=$3,status=CASE WHEN $4='locked' AND user_achievements.unlocked_at IS NOT NULL THEN 'revoked' ELSE $4 END,unlocked_at=CASE WHEN $4='unlocked' THEN COALESCE(user_achievements.unlocked_at,now()) ELSE user_achievements.unlocked_at END,updated_at=now()`,
      [who, a.code, value, unlocked ? 'unlocked' : 'locked', a.version],
    );
    if (unlocked && a.reward_rule) {
      // O marco usa o recebimento do fato que alcançou o limiar, inclusive no backfill.
      const receipt =
        a.metric === 'routes'
          ? routeReceipts[a.target - 1]
          : attendance[a.target - 1]?.verified_at;
      if (!receipt) continue;
      add(
        a.reward_rule,
        `achievement:${a.code}`,
        'achievement',
        a.code,
        receipt,
      );
    }
  }
  const challenges = (
    await db.query(
      "SELECT * FROM personal_challenges WHERE user_id=$1 AND status IN ('active','completed')",
      [who],
    )
  ).rows;
  for (const c of challenges) {
    const def = definitions.find((d) => d.code === c.code),
      value = metrics[def?.metric] ?? 0;
    await db.query(
      `UPDATE personal_challenges SET status=$3,completed_at=CASE WHEN $3='completed' THEN COALESCE(completed_at,now()) ELSE NULL END WHERE user_id=$1 AND code=$2`,
      [who, c.code, value - c.baseline >= c.target ? 'completed' : 'active'],
    );
  }
  // Os limites consideram fatos estáveis e o dia de recebimento no servidor.
  const counts = new Map<string, number>();
  const allowed = desired.filter((a) => {
    const rule = rules.find((r) => r.code === a.rule);
    if (!rule?.enabled || !rule.xp_amount) return false;
    const key = `${a.rule}:${a.at.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return n <= rule.daily_limit;
  });
  const active = (
    await db.query(
      `SELECT l.* FROM xp_ledger l WHERE l.user_id=$1 AND l.status='granted' AND NOT EXISTS(SELECT 1 FROM xp_ledger rev WHERE rev.reversal_of_id=l.id)`,
      [who],
    )
  ).rows;
  const exclusions = new Set(
    (
      await db.query(
        'SELECT occurrence_key FROM admin_xp_exclusions WHERE user_id=$1',
        [who],
      )
    ).rows.map((r) => r.occurrence_key),
  );
  const eligibleAllowed = allowed.filter((a) => !exclusions.has(a.key));
  const allowedByKey = new Map(eligibleAllowed.map((a) => [a.key, a]));
  const activeByKey = new Map(active.map((e) => [e.occurrence_key, e]));
  for (const entry of active)
    if (
      allowedByKey.get(entry.occurrence_key)?.source !== entry.source_id ||
      allowedByKey.get(entry.occurrence_key)?.rule !== entry.rule_code
    )
      await reverseGrant(
        db,
        entry.id,
        'Condição de origem deixou de ser elegível.',
        actor,
      );
  const activation = (
    await db.query('SELECT min(activated_at) AS at FROM xp_level_config')
  ).rows[0].at as Date;
  const grants = eligibleAllowed
    .filter(
      (a) =>
        activeByKey.get(a.key)?.source_id !== a.source ||
        activeByKey.get(a.key)?.rule_code !== a.rule,
    )
    .map((a) => ({ ...a, ...rules.find((r) => r.code === a.rule)! }));
  if (grants.length)
    await db.query(
      `INSERT INTO xp_ledger(user_id,rule_code,rule_version,source_type,source_id,occurrence_key,generation,xp_delta,status,reason,season_id,category,displacement_band,effective_at)
   SELECT $1,a.rule,a.version,a.type,a.source,a.key,COALESCE((SELECT max(l.generation) FROM xp_ledger l WHERE l.user_id=$1 AND l.occurrence_key=a.key),0)+1,a.xp_amount,'granted',a.description,s.id,a.category,a.band,a.at
   FROM jsonb_to_recordset($2::jsonb) AS a(rule text,version integer,type text,source text,key text,xp_amount integer,description text,category text,band text,at timestamptz)
   LEFT JOIN leaderboard_seasons s ON s.starts_at<=a.at AND s.ends_at>a.at AND a.at>=$3 AND s.status='active'`,
      [who, JSON.stringify(grants), activation],
    );
  await rebuildProjections(db, who);
  if (!more && revision !== undefined)
    await db.query(
      'DELETE FROM gamification_jobs WHERE user_id=$1 AND revision=$2',
      [who, revision],
    );
  const pending =
    (await db.query('SELECT 1 FROM gamification_jobs WHERE user_id=$1', [who]))
      .rowCount !== 0;
  return { pending: more || pending };
}

export async function reverseGrant(
  db: Db,
  id: string,
  reason: string,
  actor = 'gamification-v1',
) {
  // Somente uso interno, sob lock da conta; nunca aceita valor fornecido pelo cliente.
  await db.query(
    `INSERT INTO xp_ledger(user_id,rule_code,rule_version,source_type,source_id,occurrence_key,generation,xp_delta,status,reason,reversal_of_id,season_id,category,displacement_band,effective_at,actor)
 SELECT l.user_id,l.rule_code,l.rule_version,l.source_type,l.source_id,'reversal:'||l.id,1,-l.xp_delta,'reversal',$2,l.id,l.season_id,l.category,l.displacement_band,l.effective_at,$3 FROM xp_ledger l WHERE l.id=$1 AND l.status='granted' ON CONFLICT DO NOTHING`,
    [id, reason, actor],
  );
}
export async function rebuildProjections(db: Db, who: string) {
  await db.query(
    `INSERT INTO user_progress(user_id,lifetime_xp) SELECT $1,COALESCE(sum(xp_delta),0) FROM xp_ledger WHERE user_id=$1 ON CONFLICT(user_id) DO UPDATE SET lifetime_xp=excluded.lifetime_xp,updated_at=now()`,
    [who],
  );
  // Correções de temporadas fechadas são explícitas e incrementam sua revisão.
  await db.query(
    `UPDATE leaderboard_seasons s SET revision=revision+1 WHERE s.status IN ('closed','archived') AND EXISTS(SELECT 1 FROM xp_ledger l WHERE l.user_id=$1 AND l.season_id=s.id AND l.id>COALESCE((SELECT last_ledger_id FROM gamification_projection_cursor WHERE user_id=$1),0))`,
    [who],
  );
  await db.query('DELETE FROM leaderboard_scores WHERE user_id=$1', [who]);
  await db.query(
    `INSERT INTO leaderboard_scores(season_id,user_id,category,displacement_band,kind,score)
 SELECT season_id,user_id,category,displacement_band,kind,sum(xp_delta) FROM
 (SELECT l.*,k.kind FROM xp_ledger l CROSS JOIN LATERAL (SELECT 'xp' AS kind UNION ALL SELECT 'community' WHERE rule_code IN ('event','community') UNION ALL SELECT 'exploration' WHERE rule_code IN ('route','first_route','exploration')) k WHERE user_id=$1 AND season_id IS NOT NULL) x
 GROUP BY season_id,user_id,category,displacement_band,kind HAVING sum(xp_delta)>0`,
    [who],
  );
  await db.query(
    `INSERT INTO gamification_projection_cursor(user_id,last_ledger_id) SELECT $1,COALESCE(max(id),0) FROM xp_ledger WHERE user_id=$1 ON CONFLICT(user_id) DO UPDATE SET last_ledger_id=excluded.last_ledger_id`,
    [who],
  );
}

export async function processJobs(pool: Pool, limit = 20) {
  const jobs = (
    await pool.query(
      'SELECT user_id FROM gamification_jobs WHERE available_at<=now() ORDER BY available_at,user_id LIMIT $1',
      [limit],
    )
  ).rows;
  for (const job of jobs) {
    try {
      await transaction(pool, [job.user_id], (c) =>
        reconcileUser(c, job.user_id),
      );
    } catch {
      await pool.query(
        "UPDATE gamification_jobs SET attempts=attempts+1,available_at=now()+interval '30 seconds' WHERE user_id=$1",
        [job.user_id],
      );
    }
  }
  return jobs.length;
}
export function startGamificationWorker(pool: Pool) {
  let busy = false,
    stopped = false;
  let current: Promise<unknown> = Promise.resolve();
  const tick = () => {
    if (busy || stopped) return;
    busy = true;
    current = processJobs(pool)
      .catch(() => {})
      .finally(() => {
        busy = false;
      });
  };
  const timer = setInterval(tick, 2000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await current;
  };
}
