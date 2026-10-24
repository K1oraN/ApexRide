import type { PoolClient } from 'pg';
import { AuthError } from '../auth/validation.js';
import type { motorcycleData } from './validation.js';
export interface IdentityRow {
  id: string;
  brand: string;
  model: string;
  year: number;
  displacement_cc: number | string | null;
  propulsion: 'combustion' | 'electric';
  manufacture_year: number | null;
  version_name: string;
  catalog_variant_id: string | null;
  catalog_revision: number | null;
  archived_at: Date | null;
}
export async function resolveIdentity(
  c: PoolClient,
  b: ReturnType<typeof motorcycleData>,
  old?: IdentityRow,
) {
  const value = {
    brand: b.brand ?? old?.brand,
    model: b.model ?? old?.model,
    year: b.year ?? old?.year,
    cc: 'displacementCc' in b ? b.displacementCc : old?.displacement_cc,
    propulsion: b.propulsion ?? old?.propulsion ?? 'combustion',
    manufactureYear:
      'manufactureYear' in b
        ? b.manufactureYear
        : (old?.manufacture_year ?? null),
    versionName: b.versionName ?? old?.version_name ?? '',
    variant:
      'catalogVariantId' in b
        ? b.catalogVariantId
        : (old?.catalog_variant_id ?? null),
    revision:
      'catalogRevision' in b
        ? b.catalogRevision
        : (old?.catalog_revision ?? null),
  };
  if (value.propulsion === 'electric' ? value.cc !== null : value.cc == null)
    throw new AuthError(
      400,
      'Combustão exige cilindrada; elétrica exige cilindrada nula.',
    );
  if ((value.variant == null) !== (value.revision == null))
    throw new AuthError(400, 'Selecione versão e revisão juntas.');
  if (value.variant) {
    const v = (
      await c.query(
        `SELECT v.*,m.name AS model,b.name AS brand,r.specifications FROM motorcycle_catalog_variants v JOIN motorcycle_catalog_models m ON m.id=v.model_id JOIN motorcycle_catalog_brands b ON b.id=m.brand_id JOIN motorcycle_catalog_revisions r ON r.variant_id=v.id AND r.revision=$2 WHERE v.id=$1 AND r.status='reviewed'`,
        [value.variant, value.revision],
      )
    ).rows[0];
    if (
      !v ||
      v.brand !== value.brand ||
      v.model !== value.model ||
      v.model_year !== value.year ||
      v.name !== value.versionName ||
      v.propulsion !== value.propulsion ||
      (v.specifications.displacement &&
        Number(value.cc) !== v.specifications.displacement.value)
    )
      throw new AuthError(
        400,
        'Os dados não correspondem à versão selecionada. Revise ou desvincule o catálogo.',
      );
  }
  return value;
}
export async function recordIdentity(c: PoolClient, row: IdentityRow) {
  const category = row.catalog_variant_id
    ? (
        await c.query(
          `SELECT COALESCE(c.legacy_code,'Não classificada') AS category FROM motorcycle_catalog_variants v LEFT JOIN motorcycle_catalog_categories c ON c.id=v.category_id WHERE v.id=$1`,
          [row.catalog_variant_id],
        )
      ).rows[0]?.category
    : null;
  const snapshot = {
    brand: row.brand,
    model: row.model,
    year: row.year,
    displacementCc:
      row.displacement_cc === null ? null : Number(row.displacement_cc),
    propulsion: row.propulsion,
    versionName: row.version_name,
    catalogVariantId: row.catalog_variant_id,
    catalogRevision: row.catalog_revision,
    category,
  };
  await c.query(
    'INSERT INTO motorcycle_identity_history(motorcycle_id,revision,snapshot) SELECT $1,COALESCE(max(revision),0)+1,$2 FROM motorcycle_identity_history WHERE motorcycle_id=$1',
    [row.id, JSON.stringify(snapshot)],
  );
}
