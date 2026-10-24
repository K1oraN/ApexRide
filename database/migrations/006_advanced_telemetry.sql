-- Additive: legacy activities retain NULL, no backfill or fabricated laps.
ALTER TABLE rides ADD COLUMN telemetry_summary jsonb;
CREATE TABLE ride_performance_events (
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
  type text NOT NULL CHECK (type IN ('acceleration', 'braking')),
  start_ms bigint NOT NULL CHECK (start_ms > 0),
  end_ms bigint NOT NULL CHECK (end_ms >= start_ms),
  duration_ms bigint,
  status text NOT NULL CHECK (status IN ('estimated', 'inconclusive', 'rejected')),
  reason text,
  method text NOT NULL CHECK (method = 'adjacent-linear-estimate'),
  version text NOT NULL CHECK (version = 'events-1'),
  quality jsonb NOT NULL,
  force jsonb,
  PRIMARY KEY (ride_id, id),
  UNIQUE (ride_id, type, start_ms),
  CHECK ((status = 'estimated' AND duration_ms > 0 AND duration_ms = end_ms - start_ms AND reason IS NULL)
    OR (status <> 'estimated' AND duration_ms IS NULL AND reason IS NOT NULL))
);
CREATE INDEX ride_performance_events_time_idx ON ride_performance_events(ride_id, start_ms);
