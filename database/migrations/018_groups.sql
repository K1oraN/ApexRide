CREATE TABLE groups (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  creation_key uuid NOT NULL,
  name varchar(100) NOT NULL CHECK(length(btrim(name))>0),
  description varchar(2000) NOT NULL DEFAULT '',
  privacy_type text NOT NULL CHECK(privacy_type IN ('public','private')),
  discovery_mode text NOT NULL CHECK(discovery_mode IN ('listed','unlisted')),
  join_policy text NOT NULL CHECK(join_policy IN ('immediate','approval')),
  posting_policy text NOT NULL DEFAULT 'members' CHECK(posting_policy IN ('members','staff')),
  members_can_invite boolean NOT NULL DEFAULT false,
  city varchar(100) NOT NULL DEFAULT '', state varchar(2) NOT NULL DEFAULT '',
  categories text[] NOT NULL DEFAULT '{}',
  rules jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(rules)='array'),
  rules_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','deleted')),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(owner_id,creation_key), CHECK(privacy_type='private' OR discovery_mode='listed')
);
CREATE TABLE group_memberships (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','moderator','member')),
  status text NOT NULL CHECK(status IN ('active','pending','rejected','cancelled','removed','banned')),
  accepted_rules_version integer NOT NULL,
  joined_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,user_id)
);
CREATE UNIQUE INDEX groups_one_owner ON group_memberships(group_id) WHERE role='owner';
ALTER TABLE groups ADD CONSTRAINT groups_owner_membership FOREIGN KEY(id,owner_id)
  REFERENCES group_memberships(group_id,user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION check_group_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid uuid; BEGIN
  IF TG_TABLE_NAME='groups' THEN gid:=NEW.id;
  ELSE gid:=COALESCE(NEW.group_id,OLD.group_id); END IF;
  IF EXISTS(SELECT 1 FROM groups g WHERE g.id=gid AND NOT EXISTS(
    SELECT 1 FROM group_memberships m WHERE m.group_id=g.id AND m.user_id=g.owner_id AND m.role='owner' AND m.status='active'))
  THEN RAISE EXCEPTION 'Group must have its active owner'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER groups_owner_valid AFTER INSERT OR UPDATE ON groups DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_group_owner();
CREATE CONSTRAINT TRIGGER membership_owner_valid AFTER INSERT OR UPDATE OR DELETE ON group_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_group_owner();
CREATE INDEX groups_discovery ON groups(created_at DESC,id DESC) WHERE status='active' AND discovery_mode='listed';
CREATE INDEX groups_region ON groups(state,lower(city),created_at DESC) WHERE status='active';
CREATE INDEX groups_name ON groups(lower(name),id);
CREATE INDEX groups_categories ON groups USING gin(categories);
CREATE INDEX groups_search ON groups USING gin(to_tsvector('portuguese',name||' '||description));
CREATE INDEX memberships_user ON group_memberships(user_id,status,group_id);
CREATE INDEX memberships_page ON group_memberships(group_id,status,created_at DESC,user_id DESC);
CREATE TABLE group_invitations (
  id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES groups(id),
  invited_user_id uuid REFERENCES users(id), invited_by uuid NOT NULL REFERENCES users(id),
  token_hash text UNIQUE, expires_at timestamptz(3) NOT NULL,
  usage_limit integer NOT NULL CHECK(usage_limit BETWEEN 1 AND 100),
  usage_count integer NOT NULL DEFAULT 0 CHECK(usage_count>=0 AND usage_count<=usage_limit),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','revoked','rejected','accepted')),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK(invited_user_id IS NOT NULL OR token_hash IS NOT NULL)
);
CREATE TABLE group_invitation_uses (
  invitation_id uuid NOT NULL REFERENCES group_invitations(id), user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz(3) NOT NULL DEFAULT now(), PRIMARY KEY(invitation_id,user_id)
);
CREATE INDEX invitations_inbox ON group_invitations(invited_user_id,status,created_at DESC,id DESC);
CREATE INDEX invitations_group ON group_invitations(group_id,created_at DESC,id DESC);
CREATE TABLE group_member_restrictions (
  id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES groups(id), user_id uuid NOT NULL REFERENCES users(id),
  restriction_type text NOT NULL CHECK(restriction_type IN ('suspend','ban','remove')),
  reason varchar(500) NOT NULL, applied_by uuid NOT NULL REFERENCES users(id),
  starts_at timestamptz(3) NOT NULL DEFAULT now(), expires_at timestamptz(3), revoked_at timestamptz(3)
);
CREATE INDEX restrictions_active ON group_member_restrictions(group_id,user_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE group_moderation_actions (
  id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES groups(id), actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL, target_id uuid, reason varchar(500) NOT NULL DEFAULT '',
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX group_audit_page ON group_moderation_actions(group_id,created_at DESC,id DESC);
CREATE TABLE group_rules_versions (
  group_id uuid NOT NULL REFERENCES groups(id), version integer NOT NULL, rules jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz(3) NOT NULL DEFAULT now(), PRIMARY KEY(group_id,version)
);
ALTER TABLE social_posts ADD COLUMN group_id uuid REFERENCES groups(id);
ALTER TABLE social_posts ADD COLUMN group_private boolean NOT NULL DEFAULT false;
CREATE INDEX social_group_feed ON social_posts(group_id,created_at DESC,id DESC) WHERE status='published';
ALTER TABLE social_post_media ADD COLUMN group_id uuid REFERENCES groups(id);
ALTER TABLE social_post_media ADD COLUMN group_slot text CHECK(group_slot IN ('avatar','cover'));
ALTER TABLE social_post_media ADD CONSTRAINT media_single_context CHECK(NOT(post_id IS NOT NULL AND group_id IS NOT NULL));
CREATE UNIQUE INDEX group_media_slot ON social_post_media(group_id,group_slot);
ALTER TABLE social_reports ADD COLUMN group_id uuid REFERENCES groups(id);
ALTER TABLE social_reports ADD COLUMN group_member_id uuid REFERENCES users(id);
ALTER TABLE social_reports ADD COLUMN context_group_id uuid REFERENCES groups(id);
ALTER TABLE social_reports ADD COLUMN escalation text NOT NULL DEFAULT 'platform' CHECK(escalation IN ('internal','platform'));
ALTER TABLE social_reports DROP CONSTRAINT social_reports_check;
ALTER TABLE social_reports ADD CONSTRAINT social_reports_one_target CHECK(num_nonnulls(post_id,comment_id,profile_id,group_id,group_member_id)=1);
CREATE UNIQUE INDEX social_reports_group ON social_reports(reporter_id,group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX social_reports_member ON social_reports(reporter_id,context_group_id,group_member_id) WHERE group_member_id IS NOT NULL;
