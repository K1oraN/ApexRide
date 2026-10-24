-- Partial uploads stay separate from completed rides and are private to their owner.
CREATE TABLE ride_uploads (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, client_id)
);
CREATE TABLE ride_upload_batches (
  owner_id uuid NOT NULL,
  client_id uuid NOT NULL,
  batch_index integer NOT NULL CHECK (batch_index >= 0),
  body jsonb NOT NULL,
  body_hash text NOT NULL,
  PRIMARY KEY (owner_id, client_id, batch_index),
  FOREIGN KEY (owner_id, client_id) REFERENCES ride_uploads(owner_id, client_id) ON DELETE CASCADE
);
