import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { loadConfig } from '../src/config/env.js';
const config = loadConfig();
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const requested = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  [
    cli,
    'run',
    '--maxWorkers=1',
    '--hookTimeout=30000',
    ...(requested.length
      ? requested
      : [
          'test/auth.postgres.test.ts',
          'test/admin.postgres.test.ts',
          'test/social.postgres.test.ts',
          'test/groups.postgres.test.ts',
          'test/events.postgres.test.ts',
          'test/gamification.postgres.test.ts',
          'test/motorcycles.postgres.test.ts',
          'test/garage-upgrade.postgres.test.ts',
          'test/rides.postgres.test.ts',
          'test/routes.postgres.test.ts',
          'test/history.postgres.test.ts',
          'test/comparisons.postgres.test.ts',
          'test/similarity.postgres.test.ts',
        ]),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? config.databaseUrl,
      DATABASE_SSL: config.databaseSsl,
    },
  },
);
process.exitCode = result.status ?? 1;
