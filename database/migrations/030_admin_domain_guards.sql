-- Serialize write-vs-sanction races on the same user locks used by domain services.
CREATE FUNCTION admin_user_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE who uuid; scope_name text;
BEGIN
 IF TG_TABLE_NAME='social_posts' THEN
  IF TG_OP='UPDATE' AND NEW.text IS NOT DISTINCT FROM OLD.text THEN RETURN NEW; END IF;
  who:=NEW.author_id;scope_name:='posts';
 ELSIF TG_TABLE_NAME='social_post_comments' THEN
  IF TG_OP='UPDATE' AND NEW.text IS NOT DISTINCT FROM OLD.text THEN RETURN NEW; END IF;
  who:=NEW.author_id;scope_name:='comments';
 ELSIF TG_TABLE_NAME='groups' THEN who:=NEW.owner_id;scope_name:='groups';
 ELSE who:=NEW.organizer_id;scope_name:='events'; END IF;
 PERFORM id FROM users WHERE id=who FOR UPDATE;
 IF EXISTS(SELECT 1 FROM moderation_sanctions s WHERE s.user_id=who AND s.scope IN ('account',scope_name) AND s.revoked_at IS NULL AND s.begins_at<=now() AND (s.expires_at IS NULL OR s.expires_at>now())) THEN
  RAISE EXCEPTION 'Feature restricted' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER admin_post_write_guard BEFORE INSERT OR UPDATE OF text ON social_posts FOR EACH ROW EXECUTE FUNCTION admin_user_write_guard();
CREATE TRIGGER admin_comment_write_guard BEFORE INSERT OR UPDATE OF text ON social_post_comments FOR EACH ROW EXECUTE FUNCTION admin_user_write_guard();
CREATE TRIGGER admin_group_write_guard BEFORE INSERT ON groups FOR EACH ROW EXECUTE FUNCTION admin_user_write_guard();
CREATE TRIGGER admin_event_write_guard BEFORE INSERT ON social_events FOR EACH ROW EXECUTE FUNCTION admin_user_write_guard();
CREATE TABLE admin_decision_notes(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,resource_type text NOT NULL,resource_id text NOT NULL,explanation text NOT NULL CHECK(length(explanation) BETWEEN 5 AND 2000),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX admin_notes_resource ON admin_decision_notes(resource_type,resource_id,id DESC);
CREATE TRIGGER admin_notes_immutable BEFORE UPDATE OR DELETE ON admin_decision_notes FOR EACH ROW EXECUTE FUNCTION gamification_ledger_immutable();
