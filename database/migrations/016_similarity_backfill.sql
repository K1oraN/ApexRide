-- Persisted keyset checkpoint: idle workers never rescan all historical rides.
CREATE TABLE similarity_backfill_cursor (
 version text PRIMARY KEY,
 last_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
 completed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
