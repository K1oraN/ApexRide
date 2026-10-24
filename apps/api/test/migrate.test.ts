import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { migrate } from '../src/migrate.js';

async function fixture(crlf: boolean) {
  const directory = new URL('../../../database/migrations/', import.meta.url);
  const canonical = new Map<string, string>();
  const stored = new Map<string, string>();
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  for (const version of (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    const sql = (await readFile(new URL(version, directory), 'utf8')).replace(
      /\r\n/g,
      '\n',
    );
    canonical.set(version, hash(sql));
    stored.set(version, hash(crlf ? sql.replace(/\n/g, '\r\n') : sql));
  }
  const client = {
    query: vi.fn(async (sql: string, values?: string[]) => {
      if (sql.startsWith('SELECT checksum'))
        return { rows: [{ checksum: stored.get(values![0]!) }] };
      if (sql.startsWith('UPDATE schema_migrations'))
        stored.set(values![0]!, values![1]!);
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, client, canonical, stored };
}

describe('recibos de migração portáveis entre Git/Windows/Linux', () => {
  it('aceita recibos LF sem reexecutar SQL aplicado', async () => {
    const f = await fixture(false);
    await migrate(f.pool);
    expect(f.stored).toEqual(f.canonical);
    expect(
      f.client.query.mock.calls.some(([sql]) =>
        sql.startsWith('UPDATE schema_migrations'),
      ),
    ).toBe(false);
    expect(f.client.query).toHaveBeenCalledWith('COMMIT');
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it('reconhece somente o SQL equivalente em CRLF e normaliza o recibo', async () => {
    const f = await fixture(true);
    expect(f.stored).not.toEqual(f.canonical);
    await migrate(f.pool);
    expect(f.stored).toEqual(f.canonical);
    expect(
      f.client.query.mock.calls.some(([sql]) =>
        /^(--|CREATE EXTENSION)/.test(sql),
      ),
    ).toBe(false);
    expect(f.client.query).toHaveBeenCalledWith('COMMIT');
  });
  it('continua rejeitando checksum de conteúdo alterado e faz rollback', async () => {
    const f = await fixture(false);
    f.stored.set(
      f.stored.keys().next().value!,
      createHash('sha256').update('SQL adulterado').digest('hex'),
    );
    await expect(migrate(f.pool)).rejects.toThrow(
      'Migração aplicada foi modificada',
    );
    expect(f.client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(f.client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(f.client.release).toHaveBeenCalledOnce();
  });
});
