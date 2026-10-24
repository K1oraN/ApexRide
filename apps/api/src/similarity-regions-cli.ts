import { readFile } from 'node:fs/promises';
import { loadConfig } from './config/env.js';
import { createPool } from './database.js';
import {
  importRegions,
  type RegionImport,
} from './modules/similarity/regions.js';
const db = createPool(loadConfig());
try {
  const file =
    process.argv[2] ??
    new URL(
      '../../../database/reference/alagoas-regions.json',
      import.meta.url,
    );
  const raw = await readFile(file, 'utf8');
  if (raw.length > 25000000) throw new Error('Arquivo muito grande.');
  const count = await importRegions(db, JSON.parse(raw) as RegionImport);
  console.log(
    `${count} regiões administrativas importadas; atribuições atualizadas em lotes de 100.`,
  );
} catch {
  console.error(
    'Importação recusada. Verifique fonte IBGE, polígonos, migrações e banco.',
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
