// Opt-in destructive operations are restricted to two databases created by this run.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  copyFile,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import sharp from 'sharp';
import { loadConfig, parseEnv } from '../src/config/env.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { LocalPhotoStorage } from '../src/modules/motorcycles/photos.js';

const base = loadConfig();
const connection = new URL(base.databaseUrl);
assert(
  base.nodeEnv !== 'production',
  'Ensaio proibido com NODE_ENV=production',
);
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname),
  'Ensaio exclusivo de loopback',
);
assert.equal(base.databaseSsl, 'disable');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const local = join(root, '.local');
await mkdir(local, { recursive: true });
const directory = await mkdtemp(join(local, 'qa23-recovery-'));
const originalMedia = join(directory, 'original');
const backupMedia = join(directory, 'backup');
const restoredMedia = join(directory, 'restored');
for (const path of [originalMedia, backupMedia, restoredMedia])
  await mkdir(path);
const suffix = randomUUID().replaceAll('-', '');
const databases = [`qa23_source_${suffix}`, `qa23_restore_${suffix}`];
const created: string[] = [];
const pools: pg.Pool[] = [];
const admin = new pg.Pool({
  connectionString: base.databaseUrl,
  connectionTimeoutMillis: 3000,
});
const archive = join(directory, 'synthetic.dump');
const pgBin = process.env.PG_BIN_DIR;
const start = performance.now();
function runPg(command: string, database: string, args: string[]) {
  const result = spawnSync(
    pgBin
      ? join(pgBin, `${command}${process.platform === 'win32' ? '.exe' : ''}`)
      : command,
    args,
    {
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        PGHOST: connection.hostname,
        PGPORT: connection.port || '5432',
        PGUSER: decodeURIComponent(connection.username),
        PGPASSWORD: decodeURIComponent(connection.password),
        PGDATABASE: database,
        PGSSLMODE: 'disable',
        PGOPTIONS: '',
      },
    },
  );
  assert.equal(
    result.status,
    0,
    `${command} falhou; verifique ferramentas PostgreSQL e permissões locais`,
  );
}
async function snapshot(pool: pg.Pool) {
  const tables = await pool.query<{ name: string }>(
    "SELECT relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND relname<>'spatial_ref_sys' ORDER BY relname",
  );
  const data: Record<string, { count: string; hash: string }> = {};
  for (const { name } of tables.rows) {
    assert(/^[a-z_]+$/.test(name));
    data[name] = (
      await pool.query(
        `SELECT count(*)::text AS count, md5(coalesce(string_agg(row::text, '' ORDER BY row::text COLLATE "C"), '')) AS hash FROM (SELECT to_jsonb(t) AS row FROM public."${name}" t) s`,
      )
    ).rows[0];
  }
  return data;
}
try {
  for (const name of databases) {
    assert(/^qa23_(source|restore)_[a-f0-9]{32}$/.test(name));
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created.push(name);
    const url = new URL(connection);
    url.pathname = `/${name}`;
    pools.push(
      new pg.Pool({
        connectionString: url.toString(),
        connectionTimeoutMillis: 3000,
      }),
    );
  }
  const source = pools[0]!,
    restored = pools[1]!;
  await migrate(source);
  const migrationSql = await readFile(
    join(root, 'database/migrations/001_auth.sql'),
    'utf8',
  );
  const canonicalSql = migrationSql.replace(/\r\n/g, '\n');
  const canonicalReceipt = createHash('sha256')
    .update(canonicalSql)
    .digest('hex');
  await source.query(
    'UPDATE schema_migrations SET checksum=$1 WHERE version=$2',
    [
      createHash('sha256')
        .update(canonicalSql.replace(/\n/g, '\r\n'))
        .digest('hex'),
      '001_auth.sql',
    ],
  );
  await migrate(source);
  assert.equal(
    (
      await source.query(
        'SELECT checksum FROM schema_migrations WHERE version=$1',
        ['001_auth.sql'],
      )
    ).rows[0].checksum,
    canonicalReceipt,
  );
  await source.query(
    'UPDATE schema_migrations SET checksum=$1 WHERE version=$2',
    [
      createHash('sha256').update('SQL adulterado').digest('hex'),
      '001_auth.sql',
    ],
  );
  await assert.rejects(migrate(source), /Migração aplicada foi modificada/);
  await source.query(
    'UPDATE schema_migrations SET checksum=$1 WHERE version=$2',
    [canonicalReceipt, '001_auth.sql'],
  );
  const config = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: base.databaseUrl,
    DATABASE_SSL: 'disable',
  });
  async function appFor(pool: pg.Pool, media: string) {
    return buildApp({
      config,
      logger: false,
      database: { pool, check: async () => {}, close: async () => {} },
      motorcycleStorage: new LocalPhotoStorage(media),
    });
  }
  const app = await appFor(source, originalMedia);
  type Session = { cookie: string; csrf: string };
  const headers = (s?: Session) => ({
    origin: config.auth.webOrigin,
    'x-apex-request': '1',
    ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}),
  });
  const sessions: Session[] = [];
  let bike: string, ride: string;
  try {
    for (const username of ['qa23_owner', 'qa23_other']) {
      const password = randomBytes(24).toString('hex');
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/register',
            headers: headers(),
            payload: {
              displayName: username,
              username,
              email: `${username}@example.invalid`,
              password,
              acceptTerms: true,
              termsVersion: 'prelaunch-draft',
              privacyVersion: 'prelaunch-draft',
            },
          })
        ).statusCode,
        201,
      );
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: headers(),
        payload: { email: `${username}@example.invalid`, password },
      });
      assert.equal(login.statusCode, 200);
      sessions.push({
        cookie: String(login.headers['set-cookie']).split(';')[0]!,
        csrf: login.json().csrfToken,
      });
    }
    // Private fixtures exercise authorization after restoration, including media.
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/users/me/privacy',
          headers: headers(sessions[0]),
          payload: {
            profileVisibility: 'private',
            activityVisibility: 'private',
          },
        })
      ).statusCode,
      200,
    );
    const motorcycle = await app.inject({
      method: 'POST',
      url: '/api/motorcycles',
      headers: headers(sessions[0]),
      payload: {
        brand: 'Honda',
        model: 'QA sintético',
        year: 2024,
        displacementCc: 500,
      },
    });
    assert.equal(motorcycle.statusCode, 201);
    bike = motorcycle.json().motorcycle.id;
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#ff202b' },
    })
      .png()
      .toBuffer();
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/api/motorcycles/${bike}/photo`,
          headers: { ...headers(sessions[0]), 'content-type': 'image/png' },
          payload: image,
        })
      ).statusCode,
      200,
    );
    const startedAt = Date.now() - 60_000;
    const response = await app.inject({
      method: 'POST',
      url: '/api/rides',
      headers: headers(sessions[0]),
      payload: {
        clientId: randomUUID(),
        motorcycleId: bike,
        mode: 'passeio',
        visibility: 'private',
        startedAt,
        endedAt: startedAt + 10_000,
        intervals: [{ start: startedAt, end: startedAt + 10_000 }],
        points: [0, 1, 2].map((n) => ({
          latitude: -9,
          longitude: -35 + n * 0.0001,
          timestamp: startedAt + n * 1000,
          accuracy: 8,
          speed: 10,
          heading: 90,
          altitude: null,
          segment: 0,
        })),
      },
    });
    assert.equal(response.statusCode, 201);
    ride = response.json().id;
  } finally {
    await app.close();
  }
  const before = await snapshot(source);
  await migrate(source);
  assert.deepEqual(
    await snapshot(source),
    before,
    'Reaplicação deve preservar dados',
  );
  const backupStart = performance.now();
  runPg('pg_dump', databases[0]!, [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file',
    archive,
  ]);
  const media = await readdir(originalMedia);
  for (const name of media)
    await copyFile(join(originalMedia, name), join(backupMedia, name));
  const backupMs = performance.now() - backupStart;
  const restoreStart = performance.now();
  runPg('pg_restore', databases[1]!, [
    '--dbname',
    databases[1]!,
    '--no-owner',
    '--no-acl',
    '--exit-on-error',
    archive,
  ]);
  for (const name of media)
    await copyFile(join(backupMedia, name), join(restoredMedia, name));
  const restoreMs = performance.now() - restoreStart;
  assert.deepEqual(
    await snapshot(restored),
    before,
    'Tabelas restauradas devem coincidir',
  );
  const postgis = (
    await restored.query('SELECT postgis_lib_version() AS version')
  ).rows[0].version;
  assert.equal(
    (
      await restored.query(
        "SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await restored.query(
        'SELECT count(*)::int AS n FROM pg_index WHERE NOT indisvalid',
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await restored.query(
        'SELECT count(*)::int AS n FROM ride_points WHERE public.ST_SRID(position::public.geometry)<>4326',
      )
    ).rows[0].n,
    0,
  );
  for (const name of media)
    assert(
      (await readFile(join(originalMedia, name))).equals(
        await readFile(join(restoredMedia, name)),
      ),
    );
  await migrate(restored);
  assert.deepEqual(await snapshot(restored), before);
  const recoveredApp = await appFor(restored, restoredMedia);
  try {
    for (const url of [
      `/api/rides/${ride!}`,
      `/api/motorcycles/${bike!}/photo`,
    ]) {
      assert.equal(
        (await recoveredApp.inject({ url, headers: headers(sessions[0]) }))
          .statusCode,
        200,
      );
      assert.equal(
        (await recoveredApp.inject({ url, headers: headers(sessions[1]) }))
          .statusCode,
        404,
      );
    }
  } finally {
    await recoveredApp.close();
  }
  const report = {
    status: 'passed',
    synthetic: true,
    migrations: Number(before.schema_migrations!.count),
    tablesCompared: Object.keys(before).length,
    mediaFilesCompared: media.length,
    archiveSha256: createHash('sha256')
      .update(await readFile(archive))
      .digest('hex'),
    postgis,
    backupMs: Math.round(backupMs),
    restoreMs: Math.round(restoreMs),
    totalMs: Math.round(performance.now() - start),
    checks: [
      'fresh migrations',
      'legacy CRLF receipts normalized on PostgreSQL',
      'tampered receipt rejected with rollback',
      'populated migration reapply',
      'all application table hashes',
      'constraints',
      'indexes',
      'SRID 4326',
      'media bytes',
      'restored migration reapply',
      'owner and other-account authorization',
    ],
    limitation:
      'Ensaio local sintético; não comprova RPO/RTO de produção, armazenamento externo, WAL/PITR ou restauração de roles.',
  };
  await writeFile(
    join(local, 'parte23-recovery.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const pool of pools) await pool.end();
  for (const name of created.reverse()) {
    assert(/^qa23_(source|restore)_[a-f0-9]{32}$/.test(name));
    await admin.query(`DROP DATABASE "${name}"`);
  }
  await admin.end();
  // Delete only files inside directories allocated by this run; never touch user media.
  for (const path of [originalMedia, backupMedia, restoredMedia]) {
    for (const name of await readdir(path)) await unlink(join(path, name));
    await rmdir(path);
  }
  await unlink(archive).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await rmdir(directory);
}
