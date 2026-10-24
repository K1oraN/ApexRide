CREATE TABLE motorcycles (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  brand varchar(60) NOT NULL CHECK (char_length(btrim(brand)) BETWEEN 1 AND 60),
  model varchar(100) NOT NULL CHECK (char_length(btrim(model)) BETWEEN 1 AND 100),
  year integer NOT NULL CHECK (year >= 1885 AND year <= extract(year FROM CURRENT_DATE)::integer + 1),
  displacement_cc integer NOT NULL CHECK (displacement_cc BETWEEN 1 AND 10000),
  photo_ref text UNIQUE CHECK (photo_ref ~ '^[a-f0-9-]{36}\.webp$'),
  photo_bytes integer,
  photo_width integer,
  photo_height integer,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (archived_at IS NULL OR (is_primary = false AND photo_ref IS NULL)),
  CHECK ((photo_ref IS NULL AND photo_bytes IS NULL AND photo_width IS NULL AND photo_height IS NULL)
    OR (photo_ref IS NOT NULL AND photo_bytes > 0 AND photo_width > 0 AND photo_height > 0))
);
CREATE INDEX motorcycles_owner_active_idx ON motorcycles(owner_id, created_at, id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX motorcycles_one_primary_idx ON motorcycles(owner_id) WHERE is_primary AND archived_at IS NULL;
-- Também registra uploads antes da escrita, recuperando arquivos de processos interrompidos.
CREATE TABLE motorcycle_photo_cleanup (
  photo_ref text PRIMARY KEY CHECK (photo_ref ~ '^[a-f0-9-]{36}\.webp$'),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX motorcycle_photo_cleanup_due_idx ON motorcycle_photo_cleanup(available_at);
