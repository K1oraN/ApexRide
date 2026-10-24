ALTER TABLE social_post_media ADD COLUMN event_id uuid REFERENCES social_events(id);
ALTER TABLE social_post_media DROP CONSTRAINT media_single_context;
ALTER TABLE social_post_media ADD CONSTRAINT media_single_context CHECK(num_nonnulls(post_id,group_id,event_id)<=1);
CREATE UNIQUE INDEX event_media_cover ON social_post_media(event_id) WHERE event_id IS NOT NULL;
CREATE TABLE event_ride_authorizations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES social_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX event_ride_auth_user ON event_ride_authorizations(user_id,event_id);
