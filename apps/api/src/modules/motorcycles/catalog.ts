import { rate } from '../admin/policy.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { AdminContext } from '../admin/context.js';
import { AuthError, body, text } from '../auth/validation.js';
import { motorcycleId } from './validation.js';

export const SPEC_UNITS: Record<string, string[]> = {
  engine: ['text'],
  cylinders: ['count'],
  displacement: ['cc'],
  power: ['cv', 'hp', 'kW'],
  powerRpm: ['rpm'],
  torque: ['N·m', 'kgf·m'],
  torqueRpm: ['rpm'],
  transmission: ['text'],
  gears: ['count'],
  clutch: ['text'],
  finalDrive: ['text'],
  fuel: ['text'],
  cooling: ['text'],
  injection: ['text'],
  length: ['mm'],
  width: ['mm'],
  height: ['mm'],
  wheelbase: ['mm'],
  seatHeight: ['mm'],
  groundClearance: ['mm'],
  dryWeight: ['kg'],
  wetWeight: ['kg'],
  frontSuspension: ['text'],
  rearSuspension: ['text'],
  frontBrake: ['text'],
  rearBrake: ['text'],
  frontTyre: ['text'],
  rearTyre: ['text'],
  tank: ['L'],
  reserve: ['L'],
  lighting: ['text'],
  panel: ['text'],
  equipment: ['text'],
  nominalPower: ['kW'],
  battery: ['kWh'],
  range: ['km'],
  chargeTime: ['min'],
};
export type CatalogSpec = {
  value: string | number;
  unit: string;
  source: number;
};
export type CatalogSource = {
  title: string;
  url: string;
  consultedAt: string;
  publishedAt: string | null;
  scope: string;
};
const invalid = () => new AuthError(400, 'Dados de catálogo inválidos.');
export function catalogRevision(value: unknown) {
  const b = body(value, [
    'variantId',
    'brandId',
    'brand',
    'modelId',
    'model',
    'year',
    'versionName',
    'propulsion',
    'categoryId',
    'expectedRevision',
    'status',
    'changeNote',
    'specifications',
    'sources',
  ]);
  const variantId = motorcycleId(b.variantId),
    modelId = motorcycleId(b.modelId);
  const brandId = text(b.brandId, 1, 60);
  if (!/^[a-z0-9-]+$/.test(brandId)) throw invalid();
  const brand = text(b.brand, 1, 60),
    model = text(b.model, 1, 100),
    versionName = text(b.versionName, 1, 100),
    changeNote = text(b.changeNote, 5, 1000);
  if (
    !Number.isInteger(b.year) ||
    Number(b.year) < 1885 ||
    Number(b.year) > new Date().getFullYear() + 1 ||
    !Number.isInteger(b.expectedRevision) ||
    Number(b.expectedRevision) < 0 ||
    !['draft', 'reviewed'].includes(String(b.status)) ||
    !['electric', 'combustion'].includes(String(b.propulsion))
  )
    throw invalid();
  if (!Array.isArray(b.sources) || b.sources.length < 1 || b.sources.length > 8)
    throw invalid();
  const sources = b.sources.map((s: unknown) => {
    const x = body(s, ['title', 'url', 'consultedAt', 'publishedAt', 'scope']);
    const url = text(x.url, 1, 2000);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw invalid();
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      throw invalid();
    const consultedAt = text(x.consultedAt, 10, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(consultedAt) ||
      !Number.isFinite(Date.parse(consultedAt)) ||
      new Date(consultedAt).toISOString().slice(0, 10) !== consultedAt ||
      consultedAt > new Date().toISOString().slice(0, 10)
    )
      throw invalid();
    const publishedAt =
      x.publishedAt == null ? null : text(x.publishedAt, 10, 10);
    if (
      publishedAt &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ||
        !Number.isFinite(Date.parse(publishedAt)) ||
        new Date(publishedAt).toISOString().slice(0, 10) !== publishedAt ||
        publishedAt > consultedAt)
    )
      throw invalid();
    return {
      title: text(x.title, 1, 200),
      url,
      consultedAt,
      publishedAt,
      scope: text(x.scope, 1, 300),
    };
  });
  const raw = body(b.specifications, Object.keys(SPEC_UNITS));
  if (Object.keys(raw).length > 40) throw invalid();
  const specifications: Record<string, CatalogSpec> = {};
  for (const [key, val] of Object.entries(raw)) {
    const x = body(val, ['value', 'unit', 'source']);
    if (
      !SPEC_UNITS[key]?.includes(String(x.unit)) ||
      !Number.isInteger(x.source) ||
      Number(x.source) < 0 ||
      Number(x.source) >= sources.length
    )
      throw invalid();
    const value = x.unit === 'text' ? text(x.value, 1, 300) : x.value;
    if (
      typeof value !== 'string' &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 1000000)
    )
      throw invalid();
    if (x.unit === 'count' && !Number.isInteger(value)) throw invalid();
    if (x.unit !== 'text' && typeof value !== 'number') throw invalid();
    specifications[key] = {
      value: value as string | number,
      unit: String(x.unit),
      source: Number(x.source),
    };
  }
  if (b.propulsion === 'electric' && specifications.displacement)
    throw invalid();
  return {
    variantId,
    modelId,
    brandId,
    brand,
    model,
    versionName,
    changeNote,
    year: Number(b.year),
    expectedRevision: Number(b.expectedRevision),
    status: String(b.status),
    propulsion: String(b.propulsion),
    categoryId: b.categoryId == null ? null : text(b.categoryId, 1, 40),
    specifications,
    sources,
  };
}
export function registerCatalog(app: FastifyInstance, db: () => Pool) {
  app.addHook('onRequest', async (r) => {
    if (r.url.startsWith('/api/catalog/'))
      await rate(db(), `catalog:${r.ip}`, 240, 1);
  });
  app.get('/catalog/coverage', async () => ({
    coverage: (
      await db().query(
        `SELECT count(DISTINCT m.brand_id)::int AS brands,count(DISTINCT v.model_id)::int AS models,count(*)::int AS variants,count(*) FILTER(WHERE (SELECT count(*) FROM jsonb_object_keys(r.specifications))>=20)::int AS detailed,(SELECT count(*)::int FROM motorcycle_catalog_variants dv JOIN motorcycle_catalog_revisions dr ON dr.variant_id=dv.id AND dr.revision=dv.revision WHERE dr.status='draft') AS awaiting_review FROM motorcycle_catalog_variants v JOIN motorcycle_catalog_models m ON m.id=v.model_id JOIN motorcycle_catalog_revisions r ON r.variant_id=v.id AND r.revision=(SELECT max(rr.revision) FROM motorcycle_catalog_revisions rr WHERE rr.variant_id=v.id AND rr.status='reviewed')`,
      )
    ).rows[0],
  }));
  for (const kind of ['brands', 'models', 'years'] as const) {
    app.get(`/catalog/${kind}`, async (r) => {
      const q = r.query as Record<string, string>;
      const page = Number(q.page ?? 1),
        search = String(q.q ?? '');
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        page > 1000 ||
        search.length > 100
      )
        throw invalid();
      const field =
        kind === 'brands'
          ? 'b.id'
          : kind === 'models'
            ? 'm.id'
            : 'v.model_year::text';
      const label =
        kind === 'brands'
          ? 'b.name'
          : kind === 'models'
            ? 'm.name'
            : 'v.model_year::text';
      const rows = (
        await db().query(
          `SELECT DISTINCT ${field} AS id,${label} AS name FROM motorcycle_catalog_variants v JOIN motorcycle_catalog_models m ON m.id=v.model_id JOIN motorcycle_catalog_brands b ON b.id=m.brand_id WHERE EXISTS(SELECT 1 FROM motorcycle_catalog_revisions r WHERE r.variant_id=v.id AND r.status='reviewed') AND ($1='' OR strpos(garage_normalize(${label}),garage_normalize($1))>0) AND ($2='' OR b.id=$2) AND ($3::uuid IS NULL OR m.id=$3) ORDER BY name ${kind === 'years' ? 'DESC' : 'ASC'},id LIMIT 51 OFFSET $4`,
          [
            search,
            q.brand ?? '',
            q.model ? motorcycleId(q.model) : null,
            (page - 1) * 50,
          ],
        )
      ).rows;
      return { items: rows.slice(0, 50), hasMore: rows.length > 50, page };
    });
  }
  app.get('/catalog/categories', async () => ({
    items: (
      await db().query(
        'SELECT * FROM motorcycle_catalog_categories ORDER BY label',
      )
    ).rows,
  }));
  app.get('/catalog/variants', async (r) => {
    const q = r.query as Record<string, string>;
    const page = Number(q.page ?? 1);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1000 ||
      String(q.q ?? '').length > 100
    )
      throw invalid();
    const words = String(q.q ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((s) => s + ':*')
      .join(' & ');
    const year = q.year ? Number(q.year) : null;
    if (
      year !== null &&
      (!Number.isInteger(year) || year < 1885 || year > 2200)
    )
      throw invalid();
    const rows = (
      await db().query(
        `SELECT v.*,r.revision AS revision,m.name AS model,b.name AS brand,b.id AS brand_id,r.status FROM motorcycle_catalog_variants v JOIN motorcycle_catalog_models m ON m.id=v.model_id JOIN motorcycle_catalog_brands b ON b.id=m.brand_id JOIN motorcycle_catalog_revisions r ON r.variant_id=v.id AND r.revision=(SELECT max(rr.revision) FROM motorcycle_catalog_revisions rr WHERE rr.variant_id=v.id AND rr.status='reviewed') WHERE r.status='reviewed' AND ($1='' OR to_tsvector('simple',garage_normalize(v.search_text)) @@ to_tsquery('simple',$1)) AND ($2='' OR b.id=$2) AND ($3::uuid IS NULL OR m.id=$3) AND ($4::int IS NULL OR v.model_year=$4) ORDER BY b.name,m.name,v.model_year DESC,v.name,v.id LIMIT 21 OFFSET $5`,
        [
          words,
          q.brand ?? '',
          q.model ? motorcycleId(q.model) : null,
          year,
          (page - 1) * 20,
        ],
      )
    ).rows;
    return { items: rows.slice(0, 20), hasMore: rows.length > 20, page };
  });
  app.get('/catalog/variants/:id', async (r) => {
    const id = motorcycleId((r.params as { id: string }).id),
      q = r.query as { revision?: string };
    const revision = q.revision ? Number(q.revision) : null;
    if (revision !== null && (!Number.isInteger(revision) || revision < 1))
      throw invalid();
    const row = (
      await db().query(
        `SELECT v.*,m.name AS model,b.name AS brand,b.id AS brand_id,c.label AS category,r.revision AS revision,r.specifications,r.sources,r.status,r.change_note,r.created_at AS reviewed_at FROM motorcycle_catalog_variants v JOIN motorcycle_catalog_models m ON m.id=v.model_id JOIN motorcycle_catalog_brands b ON b.id=m.brand_id LEFT JOIN motorcycle_catalog_categories c ON c.id=v.category_id JOIN motorcycle_catalog_revisions r ON r.variant_id=v.id AND r.revision=COALESCE($2,(SELECT max(rr.revision) FROM motorcycle_catalog_revisions rr WHERE rr.variant_id=v.id AND rr.status='reviewed')) WHERE v.id=$1 AND r.status='reviewed'`,
        [id, revision],
      )
    ).rows[0];
    if (!row) throw new AuthError(404, 'Versão não encontrada.');
    return { variant: row };
  });
}
export function registerCatalogCuration(ctx: AdminContext) {
  const { app, principal, tx, audit } = ctx;
  app.post('/admin/catalog/revisions', async (r) => {
    const permission = 'admin.catalog.curate',
      op = await principal(r, permission, true),
      b = catalogRevision(r.body);
    return tx(op, permission, async (c) => {
      if (
        b.categoryId &&
        !(
          await c.query(
            'SELECT id FROM motorcycle_catalog_categories WHERE id=$1',
            [b.categoryId],
          )
        ).rowCount
      )
        throw invalid();
      const existing = (
        await c.query(
          'SELECT * FROM motorcycle_catalog_variants WHERE id=$1 FOR UPDATE',
          [b.variantId],
        )
      ).rows[0];
      if ((existing?.revision ?? 0) !== b.expectedRevision)
        throw new AuthError(
          409,
          'A versão foi alterada. Recarregue antes de revisar.',
        );
      if (
        existing &&
        (existing.model_id !== b.modelId ||
          existing.model_year !== b.year ||
          existing.name !== b.versionName ||
          existing.propulsion !== b.propulsion ||
          existing.category_id !== b.categoryId)
      )
        throw new AuthError(
          409,
          'Identidade imutável: crie outra versão para ano, categoria ou propulsão distintos.',
        );
      await c.query(
        'INSERT INTO motorcycle_catalog_brands(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [b.brandId, b.brand],
      );
      if (
        !(
          await c.query(
            'SELECT id FROM motorcycle_catalog_brands WHERE id=$1 AND name=$2',
            [b.brandId, b.brand],
          )
        ).rowCount
      )
        throw invalid();
      await c.query(
        'INSERT INTO motorcycle_catalog_models(id,brand_id,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [b.modelId, b.brandId, b.model],
      );
      if (
        !(
          await c.query(
            'SELECT id FROM motorcycle_catalog_models WHERE id=$1 AND brand_id=$2 AND name=$3',
            [b.modelId, b.brandId, b.model],
          )
        ).rowCount
      )
        throw invalid();
      if (!existing)
        await c.query(
          `INSERT INTO motorcycle_catalog_variants(id,model_id,model_year,name,market,propulsion,category_id,search_text) VALUES($1,$2,$3,$4,'BR',$5,$6,$7)`,
          [
            b.variantId,
            b.modelId,
            b.year,
            b.versionName,
            b.propulsion,
            b.categoryId,
            `${b.brand} ${b.model} ${b.model.replace(/\s/g, '')} ${b.year} ${b.versionName}`,
          ],
        );
      const revision = b.expectedRevision + 1;
      await c.query(
        'INSERT INTO motorcycle_catalog_revisions(variant_id,revision,specifications,sources,status,change_note,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          b.variantId,
          revision,
          JSON.stringify(b.specifications),
          JSON.stringify(b.sources),
          b.status,
          b.changeNote,
          op.id,
        ],
      );
      await c.query(
        'UPDATE motorcycle_catalog_variants SET revision=$2 WHERE id=$1',
        [b.variantId, revision],
      );
      await audit(
        c,
        op.id,
        'catalog_revision',
        'catalog_variant',
        b.variantId,
        permission,
        r.id,
        'allowed',
        'source_review',
        b.changeNote,
      );
      return { variantId: b.variantId, revision };
    });
  });
}
