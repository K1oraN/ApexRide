CREATE INDEX groups_name_prefix ON groups(lower(name) text_pattern_ops);
CREATE INDEX social_reports_group_context ON social_reports(context_group_id,created_at DESC,id DESC);
CREATE INDEX social_reports_group_page ON social_reports(group_id,created_at DESC,id DESC);
ALTER TABLE groups ADD COLUMN member_count integer NOT NULL DEFAULT 0 CHECK(member_count>=0);
ALTER TABLE groups ADD COLUMN pending_count integer NOT NULL DEFAULT 0 CHECK(pending_count>=0);
ALTER TABLE groups ADD COLUMN post_count integer NOT NULL DEFAULT 0 CHECK(post_count>=0);
UPDATE groups g SET member_count=(SELECT count(*) FROM group_memberships m WHERE m.group_id=g.id AND m.status='active'),
  pending_count=(SELECT count(*) FROM group_memberships m WHERE m.group_id=g.id AND m.status='pending'),
  post_count=(SELECT count(*) FROM social_posts p WHERE p.group_id=g.id AND p.status='published');
CREATE FUNCTION update_group_membership_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    UPDATE groups SET member_count=member_count-CASE WHEN OLD.status='active' THEN 1 ELSE 0 END,
      pending_count=pending_count-CASE WHEN OLD.status='pending' THEN 1 ELSE 0 END WHERE id=OLD.group_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    UPDATE groups SET member_count=member_count+CASE WHEN NEW.status='active' THEN 1 ELSE 0 END,
      pending_count=pending_count+CASE WHEN NEW.status='pending' THEN 1 ELSE 0 END WHERE id=NEW.group_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER group_membership_counts AFTER INSERT OR UPDATE OR DELETE ON group_memberships FOR EACH ROW EXECUTE FUNCTION update_group_membership_counts();
CREATE FUNCTION update_group_post_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') AND OLD.group_id IS NOT NULL AND OLD.status='published' THEN
    UPDATE groups SET post_count=post_count-1 WHERE id=OLD.group_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.group_id IS NOT NULL AND NEW.status='published' THEN
    UPDATE groups SET post_count=post_count+1 WHERE id=NEW.group_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER group_post_counts AFTER INSERT OR UPDATE OR DELETE ON social_posts FOR EACH ROW EXECUTE FUNCTION update_group_post_counts();
CREATE INDEX groups_members_sort ON groups(member_count DESC,id) WHERE status='active';
