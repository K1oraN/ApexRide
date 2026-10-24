-- Etapa 6: additive catalogue and private records; original migrations stay immutable.
CREATE FUNCTION garage_normalize(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT lower(translate($1,'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))
$$;
CREATE TABLE motorcycle_catalog_categories(id text PRIMARY KEY,label text NOT NULL,legacy_code text);
INSERT INTO motorcycle_catalog_categories VALUES
 ('street','Street / Naked','Naked'),('sport','Sport / Supersport','Esportiva'),('touring','Touring','Touring'),
 ('sport-touring','Sport Touring','Touring'),('adventure','Adventure','Trail/Adventure'),('trail','Trail','Trail/Adventure'),
 ('dual-sport','Dual Sport','Trail/Adventure'),('cruiser','Custom / Cruiser','Custom'),('scooter','Scooter','Scooter'),
 ('cub','Motoneta / Cub','Outras'),('off-road','Off-road','Outras'),('electric','Elétrica',NULL),('retro','Clássica / Retro','Outras'),('other','Outras','Outras');
CREATE TABLE motorcycle_catalog_brands(id text PRIMARY KEY,name varchar(60) NOT NULL UNIQUE);
CREATE TABLE motorcycle_catalog_models(id uuid PRIMARY KEY,brand_id text NOT NULL REFERENCES motorcycle_catalog_brands(id),name varchar(100) NOT NULL,UNIQUE(brand_id,name));
CREATE TABLE motorcycle_catalog_variants(id uuid PRIMARY KEY,model_id uuid NOT NULL REFERENCES motorcycle_catalog_models(id),model_year integer NOT NULL CHECK(model_year BETWEEN 1885 AND 2200),name varchar(100) NOT NULL,market text NOT NULL CHECK(market='BR'),propulsion text NOT NULL CHECK(propulsion IN ('combustion','electric')),category_id text REFERENCES motorcycle_catalog_categories(id),search_text text NOT NULL,revision integer NOT NULL DEFAULT 0,UNIQUE(model_id,model_year,name));
CREATE INDEX motorcycle_catalog_search ON motorcycle_catalog_variants USING gin(to_tsvector('simple',garage_normalize(search_text)));
CREATE INDEX motorcycle_catalog_model_year ON motorcycle_catalog_variants(model_id,model_year,id);
CREATE TABLE motorcycle_catalog_revisions(variant_id uuid NOT NULL REFERENCES motorcycle_catalog_variants(id),revision integer NOT NULL CHECK(revision>0),specifications jsonb NOT NULL CHECK(jsonb_typeof(specifications)='object'),sources jsonb NOT NULL CHECK(jsonb_typeof(sources)='array'),status text NOT NULL CHECK(status IN ('draft','reviewed')),change_note text NOT NULL,reviewed_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(variant_id,revision));
ALTER TABLE motorcycles ALTER COLUMN displacement_cc DROP NOT NULL;
ALTER TABLE motorcycles ALTER COLUMN displacement_cc TYPE numeric(8,2);
ALTER TABLE motorcycles ADD COLUMN propulsion text NOT NULL DEFAULT 'combustion' CHECK(propulsion IN ('combustion','electric'));
ALTER TABLE motorcycles ADD CONSTRAINT motorcycles_propulsion_cc CHECK((propulsion='electric' AND displacement_cc IS NULL) OR (propulsion='combustion' AND displacement_cc BETWEEN 1 AND 10000));
ALTER TABLE motorcycles ADD COLUMN manufacture_year integer CHECK(manufacture_year BETWEEN 1885 AND 2200);
ALTER TABLE motorcycles ADD COLUMN version_name varchar(100) NOT NULL DEFAULT '';
ALTER TABLE motorcycles ADD COLUMN catalog_variant_id uuid;
ALTER TABLE motorcycles ADD COLUMN catalog_revision integer;
ALTER TABLE motorcycles ADD CONSTRAINT motorcycle_catalog_reference FOREIGN KEY(catalog_variant_id,catalog_revision) REFERENCES motorcycle_catalog_revisions(variant_id,revision);
ALTER TABLE motorcycles ADD CONSTRAINT motorcycle_catalog_pair CHECK((catalog_variant_id IS NULL)=(catalog_revision IS NULL));
CREATE TABLE motorcycle_identity_history(motorcycle_id uuid NOT NULL REFERENCES motorcycles(id),revision integer NOT NULL,snapshot jsonb NOT NULL,effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(motorcycle_id,revision));
-- The previous identity timeline is unknown: the baseline starts at upgrade, not creation.
INSERT INTO motorcycle_identity_history SELECT id,1,jsonb_build_object('brand',brand,'model',model,'year',year,'displacementCc',displacement_cc,'propulsion','combustion','versionName','','catalogVariantId',NULL,'catalogRevision',NULL,'category',NULL),clock_timestamp() FROM motorcycles;
CREATE INDEX motorcycle_identity_time ON motorcycle_identity_history(motorcycle_id,effective_at DESC,revision DESC);
CREATE TABLE motorcycle_records(id uuid PRIMARY KEY,motorcycle_id uuid NOT NULL REFERENCES motorcycles(id),kind text NOT NULL CHECK(kind IN ('maintenance','odometer','note','insurance','document','reminder','modification')),data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<20000),revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);
CREATE INDEX motorcycle_records_list ON motorcycle_records(motorcycle_id,kind,created_at DESC,id) WHERE deleted_at IS NULL;
CREATE TABLE motorcycle_record_revisions(record_id uuid NOT NULL REFERENCES motorcycle_records(id),revision integer NOT NULL,data jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),action text NOT NULL CHECK(action IN ('create','update','delete')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(record_id,revision));
-- Decimal technical displacements remain numeric; null electric displacement is unclassified.
DROP INDEX rides_comparison_cc;
CREATE INDEX rides_comparison_cc ON rides(route_id,((motorcycle_snapshot->>'displacementCc')::numeric)) WHERE deleted_at IS NULL;
INSERT INTO admin_permissions VALUES('admin.catalog.curate');
INSERT INTO admin_roles VALUES('catalog_curator','Curador de catálogo',true);
INSERT INTO admin_role_permissions VALUES('catalog_curator','admin.catalog.curate'),('superadmin','admin.catalog.curate');
