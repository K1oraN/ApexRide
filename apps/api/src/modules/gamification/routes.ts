import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { AuthError } from '../auth/validation.js';
import { digest } from '../auth/security.js';
import { fields } from '../events/validation.js';
import { id, text } from '../social/validation.js';
import { notBlocked } from '../social/block-policy.js';
import { transaction } from '../groups/store.js';
import { eventContext, manage } from '../events/policy.js';
import { audit } from '../events/store.js';
import { reconcileUser, ensureSeasons } from './engine.js';
import {
  progress,
  achievements,
  leaderboard,
  rankingQuery,
  page,
  states,
  categories,
  bands,
} from './queries.js';
import { circuitResults } from './circuits.js';

export async function gamificationRoutes(
  app: FastifyInstance,
  options: { config: Config; pool?: Pool | undefined },
) {
  const db = () => {
    if (!options.pool)
      throw new AuthError(503, 'Progressão temporariamente indisponível.');
    return options.pool;
  };
  const principal = createPrincipal(options.config, db),
    users = new WeakMap<FastifyRequest, string>();
  const who = (r: FastifyRequest) => users.get(r)!;
  app.addHook('onRequest', sessionGuard(options.config));
  app.addHook('onRequest', async (r, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Vary', 'Cookie');
    const user = (await principal(r, !['GET', 'HEAD'].includes(r.method))).user
      .id;
    users.set(r, user);
    const rate = (
      await db().query(
        `INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN now()+interval '1 minute' ELSE auth_rate_limits.expires_at END RETURNING attempts`,
        [
          digest(
            `gamification:${user}:${r.method === 'GET' ? 'read' : 'write'}`,
          ),
        ],
      )
    ).rows[0];
    if (rate.attempts > (r.method === 'GET' ? 180 : 30))
      throw new AuthError(429, 'Aguarde antes de tentar novamente.');
  });
  app.get('/gamification/me', async (r) => ({
    status: 'ok',
    progress: await progress(db(), who(r)),
  }));
  app.get('/gamification/me/xp-history', async (r) => {
    const q = fields(r.query ?? {}, ['page', 'rideId']),
      p = page(q.page),
      ride = q.rideId === undefined ? null : id(q.rideId);
    const items = (
      await db().query(
        `SELECT id,rule_code,rule_version,source_type,source_id,xp_delta,status,reason,reversal_of_id,created_at,season_id FROM xp_ledger WHERE user_id=$1 AND ($2::text IS NULL OR (source_type='ride' AND source_id=$2)) ORDER BY id DESC LIMIT 21 OFFSET $3`,
        [who(r), ride, (p - 1) * 20],
      )
    ).rows;
    return { items: items.slice(0, 20), hasMore: items.length > 20, page: p };
  });
  app.get('/gamification/achievements', async () => ({
    items: (
      await db().query(
        'SELECT code,name,description,category,icon,target,version,enabled FROM achievement_definitions ORDER BY category,target,code',
      )
    ).rows,
  }));
  app.get('/gamification/me/achievements', async (r) => ({
    items: await achievements(db(), who(r)),
  }));
  app.get('/gamification/me/rides/:id', async (r) => {
    const ride = id((r.params as { id: string }).id),
      owner = who(r);
    const own = (
      await db().query(
        'SELECT id FROM rides WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',
        [ride, owner],
      )
    ).rowCount;
    if (!own) throw new AuthError(404, 'Atividade indisponível.');
    const fact = (
      await db().query(
        'SELECT state,reason FROM gamification_ride_facts WHERE ride_id=$1',
        [ride],
      )
    ).rows[0] ?? {
      state: 'pending',
      reason: 'Aguardando avaliação no servidor.',
    };
    const xp = Number(
      (
        await db().query(
          "SELECT COALESCE(sum(xp_delta),0) AS xp FROM xp_ledger WHERE user_id=$1 AND source_type='ride' AND source_id=$2",
          [owner, ride],
        )
      ).rows[0].xp,
    );
    return { fact, xp };
  });
  app.get('/gamification/me/challenges', async (r) => ({
    items: (
      await db().query(
        `SELECT c.*,d.name,d.description,d.metric,COALESCE(a.current_value,0) AS current_value FROM personal_challenges c JOIN achievement_definitions d ON d.code=c.code LEFT JOIN user_achievements a ON a.user_id=c.user_id AND a.achievement_code=c.code WHERE c.user_id=$1 ORDER BY c.created_at DESC`,
        [who(r)],
      )
    ).rows,
  }));
  app.post('/gamification/me/challenges', async (r) => {
    const b = fields(r.body, ['code']);
    if (!['first_ride', 'first_route', 'first_event'].includes(String(b.code)))
      throw new AuthError(400, 'Meta indisponível.');
    await transaction(db(), [who(r)], async (c) => {
      await c.query(
        `INSERT INTO personal_challenges(user_id,code,baseline,target,status) SELECT $1,d.code,COALESCE(a.current_value,0),1,'active' FROM achievement_definitions d LEFT JOIN user_achievements a ON a.achievement_code=d.code AND a.user_id=$1 WHERE d.code=$2 AND d.enabled ON CONFLICT(user_id,code) DO UPDATE SET baseline=excluded.baseline,status='active',created_at=now(),completed_at=NULL WHERE personal_challenges.status='cancelled'`,
        [who(r), b.code],
      );
    });
    return { status: 'ok' };
  });
  app.delete('/gamification/me/challenges/:code', async (r) => {
    await db().query(
      "UPDATE personal_challenges SET status='cancelled' WHERE user_id=$1 AND code=$2",
      [who(r), (r.params as { code: string }).code],
    );
    return { status: 'ok' };
  });
  app.get('/gamification/seasons', async () => {
    await ensureSeasons(db());
    return {
      items: (
        await db().query(
          'SELECT * FROM leaderboard_seasons ORDER BY starts_at DESC LIMIT 120',
        )
      ).rows,
    };
  });
  app.get('/gamification/seasons/:id', async (r) => {
    const season = (r.params as { id: string }).id;
    if (!/^\d{4}-\d{2}$/.test(season))
      throw new AuthError(400, 'Temporada inválida.');
    const result = (
      await db().query('SELECT * FROM leaderboard_seasons WHERE id=$1', [
        season,
      ])
    ).rows[0];
    if (!result) throw new AuthError(404, 'Temporada indisponível.');
    return { season: result };
  });
  app.get('/gamification/leaderboards', async () => ({
    items: [
      { id: 'xp', name: 'XP da temporada' },
      { id: 'community', name: 'Participação comunitária' },
      { id: 'exploration', name: 'Exploração' },
    ],
    categories,
    bands,
  }));
  for (const suffix of ['', '/me'])
    app.get(`/gamification/leaderboards/:id${suffix}`, async (r) => {
      const kind = (r.params as { id: string }).id,
        q = rankingQuery({ ...(r.query as object), kind });
      await ensureSeasons(db());
      const result = await leaderboard(db(), who(r), q);
      return suffix
        ? {
            me: result.me,
            season: result.season,
            unavailable: result.unavailable,
          }
        : result;
    });
  app.get('/gamification/me/ranking-preferences', async (r) => ({
    preferences: (
      await db().query(
        'SELECT * FROM leaderboard_participation WHERE user_id=$1',
        [who(r)],
      )
    ).rows[0] ?? {
      opted_in: false,
      show_progress: false,
      show_achievements: false,
      circuit_opt_in: false,
      state: '',
      city: '',
    },
  }));
  app.patch('/gamification/me/ranking-preferences', async (r) => {
    const b = fields(r.body, [
      'optedIn',
      'showProgress',
      'showAchievements',
      'circuitOptIn',
      'state',
      'city',
      'consentVersion',
    ]);
    for (const k of [
      'optedIn',
      'showProgress',
      'showAchievements',
      'circuitOptIn',
    ])
      if (typeof b[k] !== 'boolean')
        throw new AuthError(400, 'Preferências inválidas.');
    const state = text(b.state, 2),
      city = text(b.city, 80);
    if (
      (state && !states.includes(state)) ||
      (city && !state) ||
      b.consentVersion !== 'gamification-v1'
    )
      throw new AuthError(400, 'Confirme as regras e a região escolhida.');
    await transaction(db(), [who(r)], async (c) => {
      const old = (
        await c.query(
          'SELECT * FROM leaderboard_participation WHERE user_id=$1',
          [who(r)],
        )
      ).rows[0];
      const changed = old && (old.state !== state || old.city !== city);
      if (
        changed &&
        old.region_changed_at &&
        Date.now() - old.region_changed_at.getTime() < 30 * 86400000
      )
        throw new AuthError(
          409,
          'A região pode ser alterada a cada 30 dias. Você pode sair do ranking a qualquer momento.',
        );
      await c.query(
        `INSERT INTO leaderboard_participation(user_id,opted_in,show_progress,show_achievements,circuit_opt_in,state,city,region_changed_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(user_id) DO UPDATE SET opted_in=$2,show_progress=$3,show_achievements=$4,circuit_opt_in=$5,state=$6,city=$7,region_changed_at=CASE WHEN $8 THEN now() ELSE leaderboard_participation.region_changed_at END,updated_at=now()`,
        [
          who(r),
          b.optedIn,
          b.showProgress,
          b.showAchievements,
          b.circuitOptIn,
          state,
          city,
          !!changed,
        ],
      );
      await c.query(
        `INSERT INTO gamification_audit(user_id,actor,action,reason) VALUES($1::uuid,$1::text,'preferences_changed',$2)`,
        [
          who(r),
          JSON.stringify({
            optedIn: b.optedIn,
            showProgress: b.showProgress,
            showAchievements: b.showAchievements,
            circuitOptIn: b.circuitOptIn,
            state,
            city,
            consentVersion: 'gamification-v1',
          }),
        ],
      );
    });
    return { status: 'ok' };
  });
  app.get('/gamification/users/:id', async (r) => {
    const target = id((r.params as { id: string }).id);
    const p = (
      await db().query(
        `SELECT l.* FROM leaderboard_participation l JOIN users u ON u.id=l.user_id JOIN privacy_settings ps ON ps.user_id=l.user_id WHERE l.user_id=$2 AND u.account_status='active' AND ps.profile_visibility='public' AND ${notBlocked('l.user_id')}`,
        [who(r), target],
      )
    ).rows[0];
    const shared = p?.show_progress ? await progress(db(), target) : null;
    return {
      progress: shared
        ? { level: shared.level, totalXp: shared.totalXp }
        : null,
      achievements: p?.show_achievements
        ? (await achievements(db(), target))
            .filter((a) => a.status === 'unlocked')
            .map((a) => ({ code: a.code, name: a.name, category: a.category }))
        : [],
    };
  });
  app.post('/gamification/me/reviews', async (r) => {
    const b = fields(r.body, ['rideId', 'reason']),
      ride = id(b.rideId),
      reason = text(b.reason, 500, true);
    if (
      !(
        await db().query('SELECT id FROM rides WHERE id=$1 AND owner_id=$2', [
          ride,
          who(r),
        ])
      ).rowCount
    )
      throw new AuthError(404, 'Atividade indisponível.');
    await db().query(
      "INSERT INTO gamification_reviews(user_id,source_type,source_id,reason) VALUES($1,'ride',$2,$3) ON CONFLICT DO NOTHING",
      [who(r), ride, reason],
    );
    return { status: 'ok' };
  });
  app.get('/circuits/:id/leaderboard', (r) =>
    circuitResults(db(), who(r), id((r.params as { id: string }).id), r.query),
  );
  // Verificação pós-evento é independente de RSVP e GPS social.
  app.patch('/events/:id/attendance/:userId', async (r) => {
    const event = id((r.params as { id: string }).id),
      target = id((r.params as { userId: string }).userId),
      actor = who(r),
      b = fields(r.body, ['verified', 'reason']);
    if (typeof b.verified !== 'boolean' || target === actor)
      throw new AuthError(
        400,
        'Presença exige verificação por outra pessoa autorizada.',
      );
    const reason = text(b.reason, 500, true);
    await transaction(db(), [actor, target], async (c) => {
      const e = await eventContext(c, actor, event, true);
      manage(e);
      if (e.status === 'cancelled' || e.ends_at.getTime() > Date.now())
        throw new AuthError(
          409,
          'Verificação disponível após o encerramento de evento não cancelado.',
        );
      const p = (
        await c.query(
          "SELECT user_id FROM event_participants WHERE event_id=$1 AND user_id=$2 AND participation_status='confirmed' AND joined_at<=$3",
          [event, target, e.ends_at],
        )
      ).rowCount;
      if (b.verified && !p)
        throw new AuthError(
          400,
          'Participação confirmada durante o evento é necessária.',
        );
      await c.query(
        `INSERT INTO event_attendance(event_id,user_id,verified_by,reason,revoked_at) VALUES($1,$2,$3,$4,CASE WHEN $5 THEN NULL ELSE now() END) ON CONFLICT(event_id,user_id) DO UPDATE SET verified_by=$3,reason=$4,revoked_at=CASE WHEN $5 THEN NULL ELSE now() END`,
        [event, target, actor, reason, b.verified],
      );
      await audit(
        c,
        event,
        actor,
        b.verified ? 'attendance_verified' : 'attendance_revoked',
        target,
      );
      await c.query(
        `INSERT INTO gamification_audit(user_id,actor,action,source_id,reason) VALUES($1,$2,$3,$4,$5)`,
        [
          target,
          actor,
          b.verified ? 'attendance_verified' : 'attendance_revoked',
          event,
          reason,
        ],
      );
      await reconcileUser(c, target);
    });
    return { status: 'ok' };
  });
}
