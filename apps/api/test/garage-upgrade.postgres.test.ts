import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { expect, it } from 'vitest';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'Etapa 6: atualiza base anterior sem alterar UUID, foto, principal, arquivada ou snapshot de Ride',
  async () => {
    const schema = 'garage_upgrade_' + randomUUID().replaceAll('-', '');
    const options = {
      connectionString: process.env.TEST_DATABASE_URL!,
      ssl:
        process.env.DATABASE_SSL === 'verify-full'
          ? { rejectUnauthorized: true }
          : false,
    };
    const root = new pg.Pool(options),
      pool = new pg.Pool({
        ...options,
        options: `-c search_path=${schema},public`,
      });
    try {
      await root.query(`CREATE SCHEMA "${schema}"`);
      const directory = new URL(
        '../../../database/migrations/',
        import.meta.url,
      );
      const files = (await readdir(directory))
        .filter((x) => /^\d+.*\.sql$/.test(x))
        .sort();
      for (const file of files.filter((x) => Number(x.slice(0, 3)) <= 33))
        await pool.query(await readFile(new URL(file, directory), 'utf8'));
      const owner = randomUUID(),
        bike = randomUUID(),
        archived = randomUUID(),
        ride = randomUUID(),
        photo = randomUUID() + '.webp';
      await pool.query(
        "INSERT INTO users(id,display_name,username,email,password_hash,terms_version,privacy_version) VALUES($1,'Fixture upgrade','fixture_upgrade','fixture_upgrade@example.com','fixture','test','test')",
        [owner],
      );
      await pool.query(
        "INSERT INTO motorcycles(id,owner_id,brand,model,year,displacement_cc,is_primary,photo_ref,photo_bytes,photo_width,photo_height,created_at) VALUES($1,$2,'Honda','CB 650R',2024,649,true,$3,100,10,10,now()-interval '1 year')",
        [bike, owner, photo],
      );
      await pool.query(
        "INSERT INTO motorcycles(id,owner_id,brand,model,year,displacement_cc,archived_at) VALUES($1,$2,'Manual','Antiga',2020,250,now())",
        [archived, owner],
      );
      const snapshot = {
        brand: 'Honda',
        model: 'CB 650R',
        year: 2024,
        displacementCc: 649,
        historicalFallback: false,
      };
      await pool.query(
        "INSERT INTO rides(id,client_id,request_hash,owner_id,motorcycle_id,mode,visibility,started_at,ended_at,active_ms,paused_ms,distance_meters,average_kmh,maximum_kmh,active_intervals,motorcycle_snapshot) VALUES($1,$2,$3,$4,$5,'passeio','private',now()-interval '1 day',now()-interval '1 day'+interval '1 minute',60000,0,100,6,10,'[]',$6)",
        [
          ride,
          randomUUID(),
          'a'.repeat(64),
          owner,
          bike,
          JSON.stringify(snapshot),
        ],
      );
      const start = Date.now();
      for (const file of files.filter((x) => Number(x.slice(0, 3)) >= 34))
        await pool.query(await readFile(new URL(file, directory), 'utf8'));
      expect(
        (
          await pool.query(
            'SELECT id,is_primary,photo_ref,displacement_cc,propulsion FROM motorcycles WHERE id=$1',
            [bike],
          )
        ).rows[0],
      ).toEqual({
        id: bike,
        is_primary: true,
        photo_ref: photo,
        displacement_cc: '649.00',
        propulsion: 'combustion',
      });
      expect(
        (
          await pool.query('SELECT archived_at FROM motorcycles WHERE id=$1', [
            archived,
          ])
        ).rows[0].archived_at,
      ).not.toBeNull();
      expect(
        (
          await pool.query(
            'SELECT motorcycle_snapshot FROM rides WHERE id=$1',
            [ride],
          )
        ).rows[0].motorcycle_snapshot,
      ).toEqual(snapshot);
      const history = (
        await pool.query(
          'SELECT effective_at FROM motorcycle_identity_history WHERE motorcycle_id=$1',
          [bike],
        )
      ).rows;
      expect(history).toHaveLength(1);
      expect(
        new Date(history[0].effective_at).getTime(),
      ).toBeGreaterThanOrEqual(start);
      expect(
        (await pool.query('SELECT count(*)::int AS n FROM motorcycles')).rows[0]
          .n,
      ).toBe(2);
    } finally {
      await pool.end();
      if (/^garage_upgrade_[a-f0-9]{32}$/.test(schema))
        await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await root.end();
    }
  },
  30000,
);
