-- Aditiva: atividades GPS antigas permanecem válidas e sem telemetria.
CREATE TABLE ride_motion (
  ride_id uuid PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
  version text NOT NULL CHECK (version='motion-1'),
  calibration jsonb,
  stats jsonb NOT NULL,
  gaps jsonb NOT NULL,
  truncated boolean NOT NULL DEFAULT false
);
CREATE TABLE ride_motion_samples (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES ride_motion(ride_id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  relative_ms bigint NOT NULL CHECK (relative_ms >= 0),
  event_timestamp double precision NOT NULL CHECK (event_timestamp >= 0 AND event_timestamp < 'Infinity'::float8),
  segment integer NOT NULL CHECK (segment >= 0),
  longitudinal double precision CHECK (longitudinal BETWEEN -29.41995 AND 29.41995),
  acceleration_g double precision CHECK (acceleration_g BETWEEN 0 AND 3),
  braking_g double precision CHECK (braking_g BETWEEN 0 AND 3),
  lean double precision CHECK (lean IS NULL),
  quality text NOT NULL CHECK (quality IN ('limited','uncalibrated','invalid','interrupted')),
  source text NOT NULL CHECK (source IN ('browser-linear','unavailable')),
  UNIQUE(ride_id,sequence),
  UNIQUE(ride_id,relative_ms)
);
