INSERT INTO admin_permissions VALUES('admin.roles.approve');
INSERT INTO admin_role_permissions VALUES('superadmin','admin.roles.approve'),('auditor','admin.roles.approve');
CREATE TABLE circuit_verification_evidence(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,route_id uuid NOT NULL REFERENCES routes(id),version integer NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),closed_venue_evidence text NOT NULL CHECK(length(closed_venue_evidence) BETWEEN 30 AND 2000),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX circuit_evidence ON circuit_verification_evidence(route_id,version);
