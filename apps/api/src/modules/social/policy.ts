import { groupPostAccess } from '../groups/policy.js';
import { notBlocked } from './block-policy.js';
export { notBlocked } from './block-policy.js';
export const follows = (author: string) =>
  `EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1::uuid AND f.followed_id=${author} AND f.status='approved')`;
export const profileAccess = (author = 'u.id') =>
  `COALESCE((${author}=$1::uuid OR ps.profile_visibility='public' OR ${follows(author)}),false)`;
export const postAccess = `s.status='published' AND u.account_status='active' AND ${notBlocked('s.author_id')} AND ((s.group_id IS NOT NULL AND ${groupPostAccess} AND ${profileAccess('s.author_id')}) OR (s.group_id IS NULL AND (s.author_id=$1::uuid OR (${profileAccess('s.author_id')} AND (s.visibility='public' OR (s.visibility='followers' AND ${follows('s.author_id')}))))))`;
export const postJoins = `FROM social_posts s JOIN users u ON u.id=s.author_id JOIN privacy_settings ps ON ps.user_id=u.id`;
export const postSelect = `SELECT s.id,s.author_id,s.text,s.visibility,s.motorcycle_id,s.ride_id,s.group_id,s.group_private,s.created_at,s.updated_at,s.achievement_code,
  (SELECT jsonb_build_object('code',d.code,'name',d.name) FROM user_achievements a JOIN achievement_definitions d ON d.code=a.achievement_code WHERE a.user_id=s.author_id AND a.achievement_code=s.achievement_code AND a.status='unlocked' AND d.enabled AND NOT EXISTS(SELECT 1 FROM admin_achievement_states ax WHERE ax.user_id=a.user_id AND ax.achievement_code=a.achievement_code)) AS achievement,
  jsonb_build_object('id',u.id,'username',u.username,'displayName',u.display_name) AS author,
  ${follows('u.id')} AS following,
  (SELECT count(*)::int FROM social_post_likes l JOIN users lu ON lu.id=l.user_id WHERE l.post_id=s.id AND lu.account_status='active' AND ${notBlocked('l.user_id')}) AS likes,
  EXISTS(SELECT 1 FROM social_post_likes l WHERE l.post_id=s.id AND l.user_id=$1::uuid) AS liked,
  (SELECT count(*)::int FROM social_post_comments c JOIN users cu ON cu.id=c.author_id WHERE c.post_id=s.id AND c.status='published' AND cu.account_status='active' AND ${notBlocked('c.author_id')}) AS comments,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'width',m.width,'height',m.height,'url','/social/media/'||m.id,'thumbnailUrl','/social/media/'||m.id||'?size=thumb') ORDER BY m.position) FROM social_post_media m WHERE m.post_id=s.id AND NOT EXISTS(SELECT 1 FROM admin_content_states ax WHERE ax.target_type='photo' AND ax.target_id=m.id)),'[]') AS media,
  (SELECT jsonb_build_object('id',m.id,'brand',m.brand,'model',m.model,'year',m.year,'displacementCc',m.displacement_cc) FROM motorcycles m WHERE m.id=s.motorcycle_id AND m.owner_id=s.author_id AND m.archived_at IS NULL AND (s.author_id=$1::uuid OR ps.profile_visibility='public')) AS motorcycle,
  (SELECT jsonb_build_object('id',r.id,'mode',r.mode,'day',to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY'),'distanceKm',round((r.distance_meters/1000)::numeric,1),'activeMinutes',round(r.active_ms/60000.0),'locationPolicy','summary-only-v1') FROM rides r WHERE r.id=s.ride_id AND r.owner_id=s.author_id AND r.deleted_at IS NULL AND r.visibility='public' AND ps.profile_visibility='public') AS ride
  ${postJoins}`;
