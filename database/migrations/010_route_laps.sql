CREATE TABLE ride_laps (
 ride_id uuid NOT NULL REFERENCES rides(id),
 circuit_id uuid NOT NULL REFERENCES routes(id),
 route_version integer NOT NULL,
 lap_number integer NOT NULL CHECK(lap_number>0),
 started_at timestamptz NOT NULL,
 ended_at timestamptz NOT NULL,
 duration_ms bigint NOT NULL CHECK(duration_ms>=10000),
 status text NOT NULL CHECK(status='estimated'),
 quality jsonb NOT NULL,
 PRIMARY KEY(ride_id,lap_number),
 CHECK(ended_at>started_at),
 FOREIGN KEY(circuit_id,route_version) REFERENCES route_versions(route_id,version)
);
