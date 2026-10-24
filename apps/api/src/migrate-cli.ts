import { loadConfig } from './config/env.js';
import { createPool } from './database.js';
import { migrate } from './migrate.js';
const pool = createPool(loadConfig());
try {
  await migrate(pool);
  console.log('Migrações aplicadas.');
} catch {
  console.error('Falha ao migrar. Verifique conexão e histórico de migrações.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
