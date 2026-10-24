CREATE TABLE routes (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('route','circuit')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Turismo',
  geometry public.geometry(LineString,4326) NOT NULL,
  distance_meters double precision NOT NULL CHECK (distance_meters > 0),
  duration_seconds double precision CHECK (duration_seconds >= 0),
  source text NOT NULL CHECK(source IN ('manual','osrm')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','rejected','archived')),
  verification text NOT NULL DEFAULT 'suggested' CHECK(verification IN ('suggested','verified')),
  start_line public.geometry(LineString,4326),
  direction smallint CHECK(direction IN (-1,1)),
  version integer NOT NULL DEFAULT 1,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(public.ST_IsValid(geometry) AND NOT public.ST_IsEmpty(geometry)),
  CHECK(public.ST_NPoints(geometry) BETWEEN 2 AND 10000),
  CHECK(public.ST_XMin(geometry) >= -180 AND public.ST_XMax(geometry) <= 180 AND public.ST_YMin(geometry) >= -85 AND public.ST_YMax(geometry) <= 85),
  CHECK(verification <> 'verified' OR (kind='circuit' AND status='approved' AND start_line IS NOT NULL AND direction IS NOT NULL))
);
CREATE INDEX routes_geometry_gist ON routes USING gist(geometry);
CREATE INDEX routes_geography_gist ON routes USING gist((geometry::public.geography));
CREATE INDEX routes_public ON routes(status,kind,created_at DESC,id);
CREATE INDEX routes_owner ON routes(owner_id,updated_at DESC);
CREATE INDEX routes_search ON routes USING gin(to_tsvector('portuguese',name || ' ' || city || ' ' || state || ' ' || description));
CREATE TABLE route_waypoints (
  route_id uuid NOT NULL REFERENCES routes(id),
  point_order integer NOT NULL CHECK(point_order BETWEEN 0 AND 24),
  position public.geometry(Point,4326) NOT NULL,
  label text NOT NULL DEFAULT '',
  PRIMARY KEY(route_id,point_order)
);
CREATE TABLE route_favorites (
  user_id uuid NOT NULL REFERENCES users(id),
  route_id uuid NOT NULL REFERENCES routes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,route_id)
);
CREATE INDEX route_favorites_route ON route_favorites(route_id);
-- Roles are granted out of band by a database operator, never through account input.
CREATE TABLE route_moderators (user_id uuid PRIMARY KEY REFERENCES users(id));
CREATE TABLE route_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route_id uuid NOT NULL REFERENCES routes(id),
  version integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK(action IN ('approve','reject','archive','verify')),
  reason text NOT NULL,
  reviewed_geometry public.geometry(LineString,4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
