-- Derived, private, versioned data. Original GPS is never changed.
CREATE TABLE similarity_regions (
 id text PRIMARY KEY, city text NOT NULL, state text NOT NULL CHECK(length(state)=2),
 boundary public.geometry(MultiPolygon,4326) NOT NULL,
 source_url text NOT NULL CHECK(source_url ~ '^https://'),
 CHECK(public.ST_IsValid(boundary))
);
CREATE INDEX similarity_regions_boundary ON similarity_regions USING gist(boundary);
CREATE TABLE ride_similarity_index (
 ride_id uuid PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
 version text NOT NULL DEFAULT 'similarity-1',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','done','insufficient','error')),
 geometry public.geography(MultiLineString,4326),
 valid_meters float8 NOT NULL DEFAULT 0 CHECK(valid_meters>=0),
 quality jsonb NOT NULL DEFAULT '{}',
 region_id text REFERENCES similarity_regions(id),
 attempts integer NOT NULL DEFAULT 0, indexed_at timestamptz,
 lease_until timestamptz, next_attempt timestamptz NOT NULL DEFAULT now(),
 candidate_count integer NOT NULL DEFAULT 0, truncated boolean NOT NULL DEFAULT false
);
CREATE INDEX ride_similarity_spatial ON ride_similarity_index USING gist(geometry);
CREATE INDEX ride_similarity_pending ON ride_similarity_index(next_attempt,ride_id) WHERE status IN ('queued','processing');
CREATE TABLE ride_similarity_matches (
 a uuid NOT NULL REFERENCES ride_similarity_index(ride_id) ON DELETE CASCADE,
 b uuid NOT NULL REFERENCES ride_similarity_index(ride_id) ON DELETE CASCADE,
 version text NOT NULL, result jsonb NOT NULL, calculated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(a,b), CHECK(a<b)
);
CREATE INDEX ride_similarity_matches_b ON ride_similarity_matches(b);
CREATE FUNCTION similarity_ride_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO ride_similarity_index(ride_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
 ELSIF NEW.deleted_at IS NOT NULL THEN
  DELETE FROM ride_similarity_index WHERE ride_id=NEW.id;
 ELSIF NEW.comparison_enabled IS DISTINCT FROM OLD.comparison_enabled THEN
  DELETE FROM ride_similarity_matches WHERE a=NEW.id OR b=NEW.id;
  UPDATE ride_similarity_index SET status='queued',attempts=0,next_attempt=now(),lease_until=NULL WHERE ride_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER similarity_ride_insert AFTER INSERT ON rides FOR EACH ROW EXECUTE FUNCTION similarity_ride_change();
CREATE TRIGGER similarity_ride_update AFTER UPDATE OF deleted_at,comparison_enabled ON rides FOR EACH ROW EXECUTE FUNCTION similarity_ride_change();
-- A bounded resumable worker performs the historical backfill, not this DDL.
