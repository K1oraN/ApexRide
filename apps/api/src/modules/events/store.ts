import type { Db } from './policy.js';
import { staff, confirmed, visible } from './policy.js';
import { AuthError } from '../auth/validation.js';
export { transaction } from '../groups/store.js';
export async function audit(
  db: Db,
  event: string,
  actor: string,
  action: string,
  target: string | null = null,
) {
  await db.query(
    'INSERT INTO event_actions(event_id,actor_id,action,target_id) VALUES($1,$2,$3,$4)',
    [event, actor, action, target],
  );
}
export const select = `SELECT e.id,e.organizer_id,e.group_id,e.route_id,e.route_version,e.title,e.description,e.rules,e.event_type,e.visibility,e.join_policy,e.city,e.state,public.ST_AsGeoJSON(e.meeting_point)::json AS meeting_point,e.meeting_point_label,e.meeting_reference,e.starts_at,e.ends_at,e.timezone,e.capacity,e.revision,e.updated_at,(SELECT em.id FROM social_post_media em WHERE em.event_id=e.id) AS image_id,
  CASE WHEN e.status='cancelled' THEN 'cancelled' WHEN e.status='finished' OR e.ends_at<=now() THEN 'finished' WHEN e.starts_at<=now() THEN 'ongoing' ELSE 'scheduled' END AS status,
  u.display_name AS organizer_name, p.participation_status, (${staff()}) AS can_manage, (${confirmed()}) AS confirmed,
  (SELECT count(*)::int FROM event_participants c WHERE c.event_id=e.id AND c.participation_status='confirmed') AS confirmed_count
  FROM social_events e JOIN users u ON u.id=e.organizer_id LEFT JOIN event_participants p ON p.event_id=e.id AND p.user_id=$1`;
export async function detail(db: Db, who: string, key: string) {
  const row = (
    await db.query(`${select} WHERE e.id=$2 AND ${visible()}`, [who, key])
  ).rows[0];
  if (!row) throw new AuthError(404, 'Evento indisponível ou sem autorização.');
  return row;
}
