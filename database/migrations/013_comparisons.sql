-- Opt-in is independent from public activity visibility; existing rides stay out.
ALTER TABLE rides ADD COLUMN comparison_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE rides ADD COLUMN comparison_technical boolean NOT NULL DEFAULT false;
ALTER TABLE rides ADD COLUMN comparison_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE rides ADD CONSTRAINT comparison_technical_optin CHECK(NOT comparison_technical OR comparison_enabled);
CREATE INDEX rides_comparison_owner ON rides(route_id,owner_id,started_at DESC,id) WHERE deleted_at IS NULL;
CREATE INDEX rides_comparison_public ON rides(route_id,route_version,mode,owner_id) WHERE deleted_at IS NULL AND visibility='public' AND comparison_enabled;
CREATE INDEX rides_comparison_cc ON rides(route_id,((motorcycle_snapshot->>'displacementCc')::integer)) WHERE deleted_at IS NULL;
-- Only verified, attributed model mappings may be inserted by an operator.
CREATE TABLE motorcycle_model_categories (
 brand text NOT NULL, model text NOT NULL,
 category text NOT NULL CHECK(category IN ('Naked','Esportiva','Trail/Adventure','Touring','Custom','Scooter','Outras')),
 source_url text NOT NULL CHECK(source_url ~ '^https://'), verified_at timestamptz NOT NULL,
 PRIMARY KEY(brand,model)
);
