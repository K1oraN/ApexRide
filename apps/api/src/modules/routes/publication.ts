import type { PoolClient } from 'pg';
import { AuthError } from '../auth/validation.js';

export type RouteVisibility = 'private' | 'public' | 'followers' | 'group';

export function parsePublication(value: unknown): {
  visibility: RouteVisibility;
  groupId: string | null;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthError(400, 'Escolha como deseja publicar o percurso.');
  const body = value as Record<string, unknown>;
  if (
    !['private', 'public', 'followers', 'group'].includes(
      String(body.visibility),
    )
  )
    throw new AuthError(400, 'Modo de publicacao invalido.');
  const visibility = body.visibility as RouteVisibility;
  const groupId = visibility === 'group' ? body.groupId : null;
  if (
    visibility === 'group' &&
    (typeof groupId !== 'string' ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
        groupId,
      ))
  )
    throw new AuthError(400, 'Selecione um grupo valido.');
  if (visibility !== 'group' && body.groupId != null)
    throw new AuthError(
      400,
      'Grupo permitido apenas em publicacoes para grupos.',
    );
  return { visibility, groupId: groupId as string | null };
}

/** Chamado DENTRO da transacao iniciada pela rota. */
export async function publishRoute(
  c: PoolClient,
  routeId: string,
  ownerId: string,
  body: unknown,
) {
  const { visibility, groupId } = parsePublication(body);
  const route = (
    await c.query(
      `SELECT id,owner_id,status,kind,version,name,source,distance_meters,
         verification,direction,public.ST_AsGeoJSON(geometry)::json AS geometry,
         public.ST_AsGeoJSON(start_line)::json AS "startLine"
       FROM routes WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
      [routeId, ownerId],
    )
  ).rows[0];
  if (!route) throw new AuthError(404, 'Percurso nao encontrado.');
  if (route.status === 'archived')
    throw new AuthError(
      409,
      'Recupere o percurso arquivado antes de publicar.',
    );

  if (groupId) {
    const member = (
      await c.query(
        `SELECT g.id,g.status,g.posting_policy,g.rules_version,g.owner_id,
           gm.role,gm.status AS member_status,gm.accepted_rules_version,
           EXISTS(SELECT 1 FROM group_member_restrictions x
             WHERE x.group_id=g.id AND x.user_id=$2
             AND x.restriction_type IN ('ban','remove','suspend')
             AND x.revoked_at IS NULL
             AND (x.expires_at IS NULL OR x.expires_at>now())) AS restricted,
           EXISTS(SELECT 1 FROM social_blocks b WHERE
             (b.blocker_id=g.owner_id AND b.blocked_id=$2) OR
             (b.blocker_id=$2 AND b.blocked_id=g.owner_id)) AS blocked
         FROM groups g LEFT JOIN group_memberships gm
           ON gm.group_id=g.id AND gm.user_id=$2
         WHERE g.id=$1 FOR SHARE OF g`,
        [groupId, ownerId],
      )
    ).rows[0];
    if (
      !member ||
      member.status !== 'active' ||
      member.member_status !== 'active' ||
      member.restricted ||
      member.blocked
    )
      throw new AuthError(403, 'Grupo indisponivel para esta publicacao.');
    if (member.accepted_rules_version !== member.rules_version)
      throw new AuthError(
        409,
        'Aceite as regras atuais do grupo antes de publicar.',
      );
    if (member.posting_policy === 'staff' && member.role === 'member')
      throw new AuthError(403, 'Somente a equipe pode publicar neste grupo.');
  }

  const published = visibility !== 'private';
  await c.query(
    `UPDATE routes SET status=$3,visibility=$4,group_id=$5,
       verification='suggested',reason='',updated_at=now()
     WHERE id=$1 AND owner_id=$2`,
    [routeId, ownerId, published ? 'approved' : 'draft', visibility, groupId],
  );
  // Continua compativel com atividades e comparacoes que usam route_versions.
  // A verificacao especial de circuitos NAO e concedida pelo autor.
  if (published) {
    const waypoints = (
      await c.query(
        `SELECT public.ST_X(position) AS lon,public.ST_Y(position) AS lat
         FROM route_waypoints WHERE route_id=$1 ORDER BY point_order`,
        [routeId],
      )
    ).rows.map((p) => [p.lon, p.lat]);
    const plan = {
      id: route.id,
      version: route.version,
      name: route.name,
      kind: route.kind,
      geometry: route.geometry,
      distanceMeters: route.distance_meters,
      verification: 'suggested',
      startLine: route.startLine,
      direction: route.direction,
      waypoints,
    };
    await c.query(
      `INSERT INTO route_versions(route_id,version,plan,verified_at)
       VALUES($1,$2,$3::jsonb,NULL)
       ON CONFLICT(route_id,version) DO UPDATE SET
         plan=EXCLUDED.plan,verified_at=NULL`,
      [routeId, route.version, JSON.stringify(plan)],
    );
  }
  return { status: 'ok', visibility, published };
}
