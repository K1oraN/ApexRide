import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
const config = loadConfig();
async function runBatch(args: string[]) {
  const schema = `auth_e2e_${randomUUID().replaceAll('-', '')}`;
  const options = {
    connectionString: process.env.TEST_DATABASE_URL ?? config.databaseUrl,
    ssl:
      config.databaseSsl === 'verify-full'
        ? { rejectUnauthorized: true }
        : false,
  };
  const admin = new pg.Pool(options);
  const pool = new pg.Pool({ ...options, options: `-c search_path=${schema}` });
  let photoDirectory: string | undefined;
  let status: number;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await migrate(pool);
    await mkdir(dirname(config.motorcycleStorageDir), { recursive: true });
    photoDirectory = await mkdtemp(`${config.motorcycleStorageDir}-e2e-`);
    const require = createRequire(
      new URL('../../web/package.json', import.meta.url),
    );
    const cli = join(
      dirname(require.resolve('@playwright/test/package.json')),
      'cli.js',
    );
    const child = spawn(process.execPath, [cli, 'test', ...args], {
      cwd: fileURLToPath(new URL('../../web/', import.meta.url)),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ADMIN_MFA_KEY: randomBytes(32).toString('hex'),
        DATABASE_URL: options.connectionString,
        DATABASE_SSL: config.databaseSsl,
        PGOPTIONS: `-c search_path=${schema},public`,
        WEB_API_PROXY_TARGET: 'http://127.0.0.1:3002',
        VITE_API_BASE_URL: '/api',
        MOTORCYCLE_STORAGE_DIR: photoDirectory,
      },
    });
    status = await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
      child.on('error', () => resolve(1));
    });
  } catch {
    console.error(
      'Falha nos testes de navegador. Verifique PostgreSQL, Chrome e portas 3002/5174.',
    );
    status = 1;
  } finally {
    await pool.end();
    if (/^auth_e2e_[a-f0-9]{32}$/.test(schema)) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } else {
      status = 1;
    }
    await admin.end();
    if (photoDirectory) {
      for (const name of await readdir(photoDirectory)) {
        if (name === 'social') {
          const socialDirectory = join(photoDirectory, 'social');
          for (const file of await readdir(socialDirectory))
            await unlink(join(socialDirectory, file));
          await rmdir(socialDirectory);
        } else await unlink(join(photoDirectory, name));
      }
      await rmdir(photoDirectory);
    }
  }
  return status;
}
// Cada arquivo recebe banco e servidor novos: o volume total da regressão não
// deve esgotar o limite de cadastros por IP nem alterar a proteção da aplicação.
const requested = process.argv.slice(2);
const batches = requested.length
  ? [requested]
  : (await readdir(fileURLToPath(new URL('../../web/e2e/', import.meta.url))))
      .filter((name) => name.endsWith('.spec.ts'))
      .sort()
      .map((name) => [name]);
for (const args of batches) {
  if (await runBatch(args)) process.exitCode = 1;
}
