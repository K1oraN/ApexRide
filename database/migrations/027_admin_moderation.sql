CREATE TABLE moderation_cases(id uuid PRIMARY KEY,source_report_id uuid UNIQUE REFERENCES social_reports(id),target_type text NOT NULL CHECK(target_type IN ('post','comment','photo','profile','group','group_member','event','route','circuit')),target_id uuid NOT NULL,priority text NOT NULL CHECK(priority IN ('normal','high')),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','escalated','waiting','resolved','dismissed','reopened')),assigned_to uuid REFERENCES users(id),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),closed_at timestamptz);
CREATE INDEX moderation_queue ON moderation_cases(status,priority,created_at,id);
CREATE INDEX moderation_assignment ON moderation_cases(assigned_to,status,id);
CREATE TABLE moderation_decisions(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES moderation_cases(id),reviewer_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,reason_code text NOT NULL,explanation text NOT NULL CHECK(length(explanation) BETWEEN 5 AND 2000),operation_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE moderation_sanctions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),case_id uuid REFERENCES moderation_cases(id),sanction_type text NOT NULL CHECK(sanction_type IN ('warning','restriction','suspension')),scope text NOT NULL CHECK(scope IN ('none','posts','comments','groups','events','rankings','social_gps','account')),reason text NOT NULL,policy_code text NOT NULL,applied_by uuid NOT NULL REFERENCES users(id),begins_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,revoked_at timestamptz,revoked_by uuid REFERENCES users(id),operation_id uuid UNIQUE NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(expires_at IS NULL OR expires_at>begins_at),CHECK((sanction_type='warning' AND scope='none') OR (sanction_type='suspension' AND scope='account') OR (sanction_type='restriction' AND scope NOT IN ('none','account'))));
CREATE INDEX sanctions_enforcement ON moderation_sanctions(user_id,scope,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE moderation_appeals(id uuid PRIMARY KEY,decision_id uuid REFERENCES moderation_decisions(id),sanction_id uuid REFERENCES moderation_sanctions(id),appellant_id uuid NOT NULL REFERENCES users(id),explanation text NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','upheld','overturned')),assigned_reviewer uuid REFERENCES users(id),resolution text,resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),CHECK(num_nonnulls(decision_id,sanction_id)=1));
CREATE UNIQUE INDEX appeal_decision ON moderation_appeals(decision_id,appellant_id);
CREATE UNIQUE INDEX appeal_sanction ON moderation_appeals(sanction_id,appellant_id);
CREATE INDEX appeals_queue ON moderation_appeals(status,created_at,id);
CREATE TABLE admin_content_states(target_type text NOT NULL,target_id uuid NOT NULL,state text NOT NULL CHECK(state IN ('hidden','removed')),case_id uuid REFERENCES moderation_cases(id),previous_status text,PRIMARY KEY(target_type,target_id));
ALTER TABLE social_reports ADD COLUMN media_id uuid REFERENCES social_post_media(id);
ALTER TABLE social_reports ADD COLUMN event_id uuid REFERENCES social_events(id);
ALTER TABLE social_reports ADD COLUMN route_id uuid REFERENCES routes(id);
ALTER TABLE social_reports DROP CONSTRAINT social_reports_one_target;
ALTER TABLE social_reports ADD CONSTRAINT social_reports_one_target CHECK(num_nonnulls(post_id,comment_id,profile_id,group_id,group_member_id,media_id,event_id,route_id)=1);
CREATE UNIQUE INDEX reports_media ON social_reports(reporter_id,media_id) WHERE media_id IS NOT NULL;
CREATE UNIQUE INDEX reports_event ON social_reports(reporter_id,event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX reports_route ON social_reports(reporter_id,route_id) WHERE route_id IS NOT NULL;
CREATE FUNCTION admin_report_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO moderation_cases(id,source_report_id,target_type,target_id,priority,status,created_at)
 VALUES(NEW.id,NEW.id,CASE WHEN NEW.post_id IS NOT NULL THEN 'post' WHEN NEW.comment_id IS NOT NULL THEN 'comment' WHEN NEW.profile_id IS NOT NULL THEN 'profile' WHEN NEW.group_id IS NOT NULL THEN 'group' WHEN NEW.group_member_id IS NOT NULL THEN 'group_member' WHEN NEW.media_id IS NOT NULL THEN 'photo' WHEN NEW.event_id IS NOT NULL THEN 'event' ELSE 'route' END,COALESCE(NEW.post_id,NEW.comment_id,NEW.profile_id,NEW.group_id,NEW.group_member_id,NEW.media_id,NEW.event_id,NEW.route_id),CASE WHEN NEW.reason IN ('personal_data','dangerous') THEN 'high' ELSE 'normal' END,CASE WHEN NEW.status='pending' THEN 'open' WHEN NEW.status='dismissed' THEN 'dismissed' ELSE 'resolved' END,NEW.created_at);
 RETURN NEW;
END $$;
CREATE TRIGGER admin_report_case AFTER INSERT ON social_reports FOR EACH ROW EXECUTE FUNCTION admin_report_case();
-- Backfill uses exactly the same projection, without changing report identity.
INSERT INTO moderation_cases(id,source_report_id,target_type,target_id,priority,status,created_at)
SELECT id,id,CASE WHEN post_id IS NOT NULL THEN 'post' WHEN comment_id IS NOT NULL THEN 'comment' WHEN profile_id IS NOT NULL THEN 'profile' WHEN group_id IS NOT NULL THEN 'group' ELSE 'group_member' END,COALESCE(post_id,comment_id,profile_id,group_id,group_member_id),CASE WHEN reason IN ('personal_data','dangerous') THEN 'high' ELSE 'normal' END,CASE WHEN status='pending' THEN 'open' WHEN status='dismissed' THEN 'dismissed' ELSE 'resolved' END,created_at FROM social_reports;
CREATE FUNCTION admin_sanction_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.revoked_at IS NULL AND NEW.begins_at<=now() AND (NEW.expires_at IS NULL OR NEW.expires_at>now()) THEN
  IF NEW.scope IN ('account','social_gps','events') THEN PERFORM revoke_event_gps(NEW.user_id); END IF;
  IF NEW.scope='account' THEN
   UPDATE user_sessions SET revoked_at=now() WHERE user_id=NEW.user_id AND revoked_at IS NULL;
   UPDATE admin_sessions SET revoked_at=now() WHERE user_id=NEW.user_id AND revoked_at IS NULL;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER admin_sanction_revocation AFTER INSERT OR UPDATE ON moderation_sanctions FOR EACH ROW EXECUTE FUNCTION admin_sanction_revocation();
CREATE FUNCTION admin_event_cancel_gps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status<>'scheduled' THEN
  UPDATE live_location_sessions SET revoked_at=now() WHERE event_id=NEW.id AND revoked_at IS NULL;
  DELETE FROM live_location_positions WHERE event_id=NEW.id;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER admin_event_cancel_gps AFTER UPDATE OF status ON social_events FOR EACH ROW EXECUTE FUNCTION admin_event_cancel_gps();
-- Domain reads also check these states; this trigger prevents old author edit APIs from republishing.
CREATE FUNCTION admin_content_enforce() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; state text;
BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'social_posts' THEN 'post' WHEN 'social_post_comments' THEN 'comment' ELSE 'group' END;
 SELECT x.state INTO state FROM admin_content_states x WHERE x.target_type=kind AND x.target_id=NEW.id;
 IF state IS NOT NULL THEN NEW.status:=CASE WHEN TG_TABLE_NAME='groups' THEN 'archived' WHEN state='hidden' THEN 'restricted' ELSE 'deleted' END; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER admin_post_enforce BEFORE UPDATE ON social_posts FOR EACH ROW EXECUTE FUNCTION admin_content_enforce();
CREATE TRIGGER admin_comment_enforce BEFORE UPDATE ON social_post_comments FOR EACH ROW EXECUTE FUNCTION admin_content_enforce();
CREATE TRIGGER admin_group_enforce BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION admin_content_enforce();
