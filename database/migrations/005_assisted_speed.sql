-- Preferência da conta sem alterar as preferências de privacidade existentes.
ALTER TABLE users ADD COLUMN speed_mode text NOT NULL DEFAULT 'assisted'
  CHECK (speed_mode IN ('assisted','pure'));
-- Série processada limitada; GPS original continua exclusivamente em ride_points.
ALTER TABLE rides ADD COLUMN speed_processing jsonb;
