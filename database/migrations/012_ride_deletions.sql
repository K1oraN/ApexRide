-- Stable tombstones also cover interrupted uploads whose completion was not acknowledged.
CREATE TABLE ride_deletions (
 owner_id uuid NOT NULL REFERENCES users(id),
 client_id uuid NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,client_id)
);
