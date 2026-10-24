-- Instalar PostGIS no servidor é pré-requisito; falha explícita se indisponível.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
CREATE TABLE rides (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  request_hash char(64) NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  motorcycle_id uuid NOT NULL REFERENCES motorcycles(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('passeio','pista','misto')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL CHECK (ended_at >= started_at),
  active_ms bigint NOT NULL CHECK (active_ms >= 0),
  paused_ms bigint NOT NULL CHECK (paused_ms >= 0),
  distance_meters double precision NOT NULL CHECK (distance_meters >= 0),
  average_kmh double precision CHECK (average_kmh >= 0),
  maximum_kmh double precision CHECK (maximum_kmh >= 0 AND maximum_kmh <= 360),
  active_intervals jsonb NOT NULL,
  completion_state text NOT NULL DEFAULT 'completed' CHECK (completion_state='completed'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,client_id),
  CHECK (active_ms + paused_ms = round(extract(epoch FROM (ended_at-started_at))*1000))
);
CREATE INDEX rides_owner_started_idx ON rides(owner_id,started_at DESC,id);
CREATE TABLE ride_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  point_order integer NOT NULL CHECK (point_order >= 0),
  position public.geography(Point,4326) NOT NULL,
  recorded_at timestamptz NOT NULL,
  accuracy double precision NOT NULL CHECK (accuracy BETWEEN 0 AND 50),
  speed double precision CHECK (speed >= 0),
  heading double precision CHECK (heading >= 0 AND heading < 360),
  altitude double precision,
  segment integer NOT NULL CHECK (segment >= 0),
  source text NOT NULL DEFAULT 'browser-gps' CHECK (source='browser-gps'),
  quality text NOT NULL DEFAULT 'accepted' CHECK (quality='accepted'),
  UNIQUE(ride_id,point_order)
);
CREATE INDEX ride_points_position_idx ON ride_points USING gist(position);
