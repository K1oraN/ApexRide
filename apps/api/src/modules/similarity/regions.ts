import type { Pool } from 'pg';
export interface RegionImport {
  sourceUrl: string;
  regions: { id: string; city: string; state: string; geometry: unknown }[];
}
/** Operator-only import, no browser upload or arbitrary spatial query. */
export async function importRegions(db: Pool, input: RegionImport) {
  if (
    !input ||
    !Array.isArray(input.regions) ||
    input.regions.length > 6000 ||
    new URL(input.sourceUrl).hostname !== 'servicodados.ibge.gov.br' ||
    !input.sourceUrl.startsWith('https://')
  )
    throw new Error('Fonte de regiões inválida.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(784982131)');
    for (const r of input.regions) {
      if (
        !/^\d{7}$/.test(r.id) ||
        typeof r.city !== 'string' ||
        !r.city.trim() ||
        r.city.length > 120 ||
        !/^[A-Z]{2}$/.test(r.state)
      )
        throw new Error('Região inválida.');
      await client.query(
        `INSERT INTO similarity_regions(id,city,state,boundary,source_url) VALUES($1,$2,$3,public.ST_Multi(public.ST_SetSRID(public.ST_GeomFromGeoJSON($4),4326)),$5) ON CONFLICT(id) DO UPDATE SET city=EXCLUDED.city,state=EXCLUDED.state,boundary=EXCLUDED.boundary,source_url=EXCLUDED.source_url`,
        [r.id, r.city, r.state, JSON.stringify(r.geometry), input.sourceUrl],
      );
    }
    const overlaps = await client.query(
      `SELECT 1 FROM similarity_regions a JOIN similarity_regions b ON a.id<b.id AND a.boundary&&b.boundary AND public.ST_Relate(a.boundary,b.boundary,'T********') LIMIT 1`,
    );
    if (overlaps.rowCount)
      throw new Error(
        'Regiões administrativas sobrepostas: importação recusada.',
      );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  let cursor = '00000000-0000-0000-0000-000000000000';
  while (true) {
    const batch = await db.query<{ ride_id: string }>(
      'SELECT ride_id FROM ride_similarity_index WHERE ride_id>$1 ORDER BY ride_id LIMIT 100',
      [cursor],
    );
    if (!batch.rowCount) break;
    await db.query(
      `UPDATE ride_similarity_index s SET region_id=(SELECT rg.id FROM similarity_regions rg WHERE public.ST_Covers(rg.boundary,s.geometry::public.geometry) ORDER BY rg.id LIMIT 1) WHERE s.ride_id=ANY($1::uuid[])`,
      [batch.rows.map((r) => r.ride_id)],
    );
    cursor = batch.rows.at(-1)!.ride_id;
  }
  return input.regions.length;
}
