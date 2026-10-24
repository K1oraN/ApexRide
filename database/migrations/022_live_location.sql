-- Consent metadata contains no coordinates. All GPS stays in one ephemeral slot.
CREATE TABLE live_location_sessions (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES social_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  audience_scope text NOT NULL CHECK(audience_scope IN ('organizers','confirmed')),
  precision_mode text NOT NULL CHECK(precision_mode IN ('approximate','precise')),
  consent_version text NOT NULL CHECK(consent_version='live-v1'),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_recorded_at timestamptz,
  last_update_at timestamptz,
  CHECK(expires_at>started_at AND expires_at<=started_at+interval '4 hours')
);
CREATE INDEX live_sessions_event ON live_location_sessions(event_id,expires_at) WHERE revoked_at IS NULL;
CREATE INDEX live_sessions_user ON live_location_sessions(user_id,expires_at);
CREATE UNLOGGED TABLE live_location_positions (
  session_id uuid PRIMARY KEY REFERENCES live_location_sessions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES social_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  latitude double precision NOT NULL CHECK(latitude BETWEEN -85 AND 85),
  accuracy double precision NOT NULL CHECK(accuracy>=0),
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(event_id,user_id)
);
CREATE INDEX live_positions_event ON live_location_positions(event_id,expires_at);
CREATE INDEX live_positions_expiration ON live_location_positions(expires_at);
ALTER TABLE rides ADD COLUMN event_id uuid REFERENCES social_events(id);
CREATE INDEX rides_event ON rides(event_id) WHERE event_id IS NOT NULL;
