-- Approved versions survive edits/archival, allowing offline sessions to sync later.
CREATE TABLE route_versions (
 route_id uuid NOT NULL REFERENCES routes(id),
 version integer NOT NULL,
 plan jsonb NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 PRIMARY KEY(route_id,version)
);
ALTER TABLE rides ADD COLUMN route_id uuid REFERENCES routes(id);
ALTER TABLE rides ADD COLUMN route_version integer;
ALTER TABLE rides ADD COLUMN route_snapshot jsonb;
ALTER TABLE rides ADD COLUMN route_result jsonb;
CREATE INDEX rides_route ON rides(route_id) WHERE route_id IS NOT NULL;
