import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

export async function migrate(pool: Pool) {
  const directory = fileURLToPath(
    new URL('../../../database/migrations/', import.meta.url),
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(784982130)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const version of (await readdir(directory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(`${directory}/${version}`, 'utf8');
      // Git/Windows may change line endings without changing the SQL. Store the
      // canonical LF digest and accept only equivalent legacy byte encodings.
      const normalized = sql.replace(/\r\n/g, '\n');
      const hash = (text: string) =>
        createHash('sha256').update(text).digest('hex');
      const checksum = hash(normalized);
      const previous = await client.query(
        'SELECT checksum FROM schema_migrations WHERE version=$1',
        [version],
      );
      if (previous.rows.length) {
        const stored = previous.rows[0].checksum as string;
        if (
          ![
            checksum,
            hash(normalized.replace(/\n/g, '\r\n')),
            hash(sql),
          ].includes(stored)
        )
          throw new Error('Migração aplicada foi modificada');
        if (stored !== checksum)
          await client.query(
            'UPDATE schema_migrations SET checksum=$2 WHERE version=$1',
            [version, checksum],
          );
        continue;
      }
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',
        [version, checksum],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
