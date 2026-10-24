-- Permission loss invalidates the consent itself, so rejoining/unblocking cannot
-- resurrect an old social GPS session between cleanup cycles.
CREATE FUNCTION revoke_event_gps(target_user uuid, target_group uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE live_location_sessions s SET revoked_at=now() FROM social_events e
    WHERE s.event_id=e.id AND s.user_id=target_user AND s.revoked_at IS NULL
    AND (target_group IS NULL OR e.group_id=target_group);
  DELETE FROM live_location_positions p USING social_events e
    WHERE p.event_id=e.id AND p.user_id=target_user
    AND (target_group IS NULL OR e.group_id=target_group);
END $$;
CREATE FUNCTION group_membership_revoke_event_gps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM revoke_event_gps(OLD.user_id,OLD.group_id);
    RETURN OLD;
  END IF;
  IF NEW.status<>'active' OR NEW.role<>OLD.role THEN
    PERFORM revoke_event_gps(NEW.user_id,NEW.group_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_membership_event_gps AFTER UPDATE OR DELETE ON group_memberships
FOR EACH ROW EXECUTE FUNCTION group_membership_revoke_event_gps();
CREATE FUNCTION block_revoke_event_gps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM revoke_event_gps(NEW.blocker_id);
  PERFORM revoke_event_gps(NEW.blocked_id);
  RETURN NEW;
END $$;
CREATE TRIGGER block_event_gps AFTER INSERT ON social_blocks FOR EACH ROW EXECUTE FUNCTION block_revoke_event_gps();
CREATE FUNCTION group_state_revoke_event_gps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'active' OR NEW.privacy_type<>OLD.privacy_type THEN
    UPDATE live_location_sessions s SET revoked_at=now() FROM social_events e WHERE s.event_id=e.id AND e.group_id=NEW.id AND s.revoked_at IS NULL;
    DELETE FROM live_location_positions p USING social_events e WHERE p.event_id=e.id AND e.group_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_state_event_gps AFTER UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION group_state_revoke_event_gps();
CREATE FUNCTION group_suspension_revoke_event_gps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.restriction_type='suspend' AND NEW.revoked_at IS NULL AND (NEW.expires_at IS NULL OR NEW.expires_at>now()) THEN
    PERFORM revoke_event_gps(NEW.user_id,NEW.group_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_suspension_event_gps AFTER INSERT OR UPDATE ON group_member_restrictions FOR EACH ROW EXECUTE FUNCTION group_suspension_revoke_event_gps();
CREATE FUNCTION participation_revoke_event_gps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE live_location_sessions SET revoked_at=now() WHERE event_id=OLD.event_id AND user_id=OLD.user_id AND revoked_at IS NULL;
    DELETE FROM live_location_positions WHERE event_id=OLD.event_id AND user_id=OLD.user_id;
    RETURN OLD;
  END IF;
  IF NEW.participation_status<>'confirmed' THEN
    UPDATE live_location_sessions SET revoked_at=now() WHERE event_id=NEW.event_id AND user_id=NEW.user_id AND revoked_at IS NULL;
    DELETE FROM live_location_positions WHERE event_id=NEW.event_id AND user_id=NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER participation_event_gps AFTER UPDATE OR DELETE ON event_participants FOR EACH ROW EXECUTE FUNCTION participation_revoke_event_gps();
CREATE FUNCTION account_revoke_event_gps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_status<>'active' THEN PERFORM revoke_event_gps(NEW.id); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_event_gps AFTER UPDATE OF account_status ON users FOR EACH ROW EXECUTE FUNCTION account_revoke_event_gps();
CREATE FUNCTION session_revoke_event_gps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    PERFORM revoke_event_gps(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_event_gps AFTER UPDATE OF revoked_at ON user_sessions FOR EACH ROW EXECUTE FUNCTION session_revoke_event_gps();
