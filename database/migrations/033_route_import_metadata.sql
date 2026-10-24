-- Provenance for reviewed GPX plans. No timestamps, Ride or XP changes.
ALTER TABLE routes ADD COLUMN import_metadata jsonb;
ALTER TABLE routes ADD CONSTRAINT route_import_object
  CHECK (import_metadata IS NULL OR jsonb_typeof(import_metadata) = 'object');
