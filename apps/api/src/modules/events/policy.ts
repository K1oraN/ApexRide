import type { Pool, PoolClient } from 'pg';
import { AuthError } from '../auth/validation.js';
import { notBlocked } from '../social/block-policy.js';
import { groupEligible, activeMember } from '../groups/policy.js';
import { activeSanction } from '../admin/sanctions.js';
export type Db = Pool | PoolClient;
// All identifiers in these builders are supplied by server code only.
export const groupAccess = (e = 'e', who = '$1') =>
  `(${e}.group_id IS NULL OR EXISTS(SELECT 1 FROM groups g WHERE g.id=${e}.group_id AND g.status='active' AND ${groupEligible('g', who)} AND ${activeMember('g', who)} AND NOT EXISTS(SELECT 1 FROM group_member_restrictions x WHERE x.group_id=g.id AND x.user_id=${who}::uuid AND x.restriction_type='suspend' AND x.revoked_at IS NULL AND (x.expires_at IS NULL OR x.expires_at>now()))))`;
export const staff = (e = 'e', who = '$1') =>
  `(EXISTS(SELECT 1 FROM users su WHERE su.id=${who}::uuid AND su.account_status='active') AND ${groupAccess(e, who)} AND (${e}.group_id IS NULL OR EXISTS(SELECT 1 FROM group_memberships ga WHERE ga.group_id=${e}.group_id AND ga.user_id=${who}::uuid AND ga.status='active' AND ga.role IN ('owner','admin'))) AND (${e}.organizer_id=${who}::uuid OR EXISTS(SELECT 1 FROM event_organizers eo WHERE eo.event_id=${e}.id AND eo.user_id=${who}::uuid) OR EXISTS(SELECT 1 FROM group_memberships ga WHERE ga.group_id=${e}.group_id AND ga.user_id=${who}::uuid AND ga.status='active' AND ga.role IN ('owner','admin'))))`;
export const eligible = (e = 'e', who = '$1') =>
  `EXISTS(SELECT 1 FROM users eu WHERE eu.id=${who}::uuid AND eu.account_status='active') AND EXISTS(SELECT 1 FROM users ou WHERE ou.id=${e}.organizer_id AND ou.account_status='active') AND ${notBlocked(`${e}.organizer_id`, who)} AND ${groupAccess(e, who)}`;
export const invited = (e = 'e', who = '$1') =>
  `EXISTS(SELECT 1 FROM event_invitations i WHERE i.event_id=${e}.id AND i.invited_user_id=${who}::uuid AND i.status='pending' AND i.expires_at>now() AND ${staff(e, 'i.invited_by')} AND ${notBlocked('i.invited_by', who)})`;
export const visible = (e = 'e', who = '$1') =>
  `${eligible(e, who)} AND (${e}.visibility<>'invite' OR ${staff(e, who)} OR ${invited(e, who)} OR EXISTS(SELECT 1 FROM event_participants ep WHERE ep.event_id=${e}.id AND ep.user_id=${who}::uuid AND ep.participation_status IN ('confirmed','pending','interested')))`;
export const confirmed = (e = 'e', who = '$1') =>
  `${eligible(e, who)} AND EXISTS(SELECT 1 FROM event_participants cp WHERE cp.event_id=${e}.id AND cp.user_id=${who}::uuid AND cp.participation_status='confirmed')`;
export const open = (e = 'e') =>
  `${e}.status='scheduled' AND ${e}.ends_at>now()`;
export const liveEligible = (e = 'e', who = '$1') =>
  `${open(e)} AND ${e}.starts_at<=now() AND (${confirmed(e, who)}) AND NOT ${activeSanction(who + '::uuid', 'social_gps')} AND NOT ${activeSanction(who + '::uuid', 'events')}`;
export async function eventContext(
  db: Db,
  who: string,
  key: string,
  lock = false,
) {
  if (lock)
    await db.query('SELECT id FROM social_events WHERE id=$1 FOR UPDATE', [
      key,
    ]);
  const row = (
    await db.query(
      `SELECT e.*,public.ST_AsGeoJSON(e.meeting_point)::json AS point,(${staff()}) AS can_manage,(${confirmed()}) AS confirmed, (e.organizer_id=$1 AND (${staff()})) AS is_primary, p.participation_status FROM social_events e LEFT JOIN event_participants p ON p.event_id=e.id AND p.user_id=$1 WHERE e.id=$2 AND ${visible()}`,
      [who, key],
    )
  ).rows[0];
  if (!row) throw new AuthError(404, 'Evento indisponível ou sem autorização.');
  return row;
}
export function manage(e: { can_manage: boolean }) {
  if (!e.can_manage) throw new AuthError(403, 'Organização não autorizada.');
}
export function requireOpen(e: { status: string; ends_at: Date }) {
  if (e.status !== 'scheduled' || e.ends_at.getTime() <= Date.now())
    throw new AuthError(409, 'Evento encerrado ou cancelado.');
}
