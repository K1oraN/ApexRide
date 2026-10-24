-- Part 19: creation idempotency belongs to the original creator, across transfers.
ALTER TABLE groups ADD COLUMN creator_id uuid REFERENCES users(id) ON DELETE RESTRICT;
UPDATE groups g SET creator_id=COALESCE((SELECT a.actor_id FROM group_moderation_actions a WHERE a.group_id=g.id AND a.action='create' ORDER BY a.created_at,a.id LIMIT 1),g.owner_id);
ALTER TABLE groups ALTER COLUMN creator_id SET NOT NULL;
ALTER TABLE groups DROP CONSTRAINT groups_owner_id_creation_key_key;
CREATE UNIQUE INDEX groups_creator_creation ON groups(creator_id,creation_key);
