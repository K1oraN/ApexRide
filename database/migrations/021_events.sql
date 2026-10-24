CREATE TABLE social_events (
  id uuid PRIMARY KEY,
  organizer_id uuid NOT NULL REFERENCES users(id),
  creation_key uuid NOT NULL,
  group_id uuid REFERENCES groups(id),
  route_id uuid REFERENCES routes(id),
  route_version integer,
  title text NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
  description text NOT NULL DEFAULT '',
  rules text NOT NULL DEFAULT '',
  event_type text NOT NULL CHECK(event_type IN ('meetup','ride')),
  visibility text NOT NULL CHECK(visibility IN ('public','group','invite')),
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','finished','cancelled')),
  join_policy text NOT NULL CHECK(join_policy IN ('immediate','approval')),
  city text NOT NULL,
  state text NOT NULL,
  meeting_point public.geometry(Point,4326) NOT NULL,
  meeting_point_label text NOT NULL,
  meeting_reference text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL,
  capacity integer CHECK(capacity BETWEEN 1 AND 100000),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organizer_id,creation_key),
  FOREIGN KEY(route_id,route_version) REFERENCES route_versions(route_id,version),
  CHECK(ends_at>starts_at),
  CHECK((route_id IS NULL)=(route_version IS NULL)),
  CHECK(event_type='ride' OR route_id IS NULL),
  CHECK(visibility<>'group' OR group_id IS NOT NULL),
  CHECK(group_id IS NULL OR visibility='group'),
  CHECK(public.ST_X(meeting_point) BETWEEN -180 AND 180 AND public.ST_Y(meeting_point) BETWEEN -85 AND 85)
);
CREATE INDEX events_region ON social_events(state,lower(city),starts_at,id);
CREATE INDEX events_schedule ON social_events(starts_at,id) WHERE status='scheduled';
CREATE INDEX events_group ON social_events(group_id,starts_at);
CREATE INDEX events_point ON social_events USING gist(meeting_point);
CREATE INDEX events_search ON social_events USING gin(to_tsvector('portuguese',title||' '||city||' '||state));
CREATE TABLE event_participants (
  event_id uuid NOT NULL REFERENCES social_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  participation_status text NOT NULL CHECK(participation_status IN ('interested','confirmed','pending','cancelled','rejected','removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,user_id)
);
CREATE INDEX event_participants_user ON event_participants(user_id,participation_status,event_id);
CREATE INDEX event_participants_status ON event_participants(event_id,participation_status);
CREATE TABLE event_organizers (
  event_id uuid NOT NULL REFERENCES social_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  granted_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,user_id)
);
CREATE TABLE event_invitations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES social_events(id),
  invited_user_id uuid NOT NULL REFERENCES users(id),
  invited_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,invited_user_id)
);
CREATE INDEX event_invitations_user ON event_invitations(invited_user_id,expires_at);
CREATE TABLE event_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES social_events(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  target_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
