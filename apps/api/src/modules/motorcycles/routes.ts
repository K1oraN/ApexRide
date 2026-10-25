import {
  resolveIdentity,
  recordIdentity,
  type IdentityRow,
} from './identity.js';
import { registerCatalog } from './catalog.js';
import { registerGarageRecords } from './records.js';
import { registerPermanentMotorcycleDeletion } from './permanent-delete.js';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Config } from '../../config/env.js';
import { createPrincipal, sessionGuard } from '../auth/session.js';
import { AuthError, username } from '../auth/validation.js';
import { notBlocked } from '../social/policy.js';
import { MAX_PHOTO_BYTES, motorcycleData, motorcycleId } from './validation.js';
import {
  cleanupPhotos,
  LocalPhotoStorage,
  optimizePhoto,
  type PhotoStorage,
} from './photos.js';

interface MotorcycleRow extends IdentityRow {
  id: string;
  owner_id: string;
  brand: string;
  model: string;
  year: number;
  displacement_cc: number | string | null;
  is_primary: boolean;
  photo_ref: string | null;
  created_at: Date;
  updated_at: Date;
}
const privateVisible = (row: MotorcycleRow) => ({
  id: row.id,
  brand: row.brand,
  model: row.model,
  year: row.year,
  displacementCc:
    row.displacement_cc === null ? null : Number(row.displacement_cc),
  propulsion: row.propulsion,
  manufactureYear: row.manufacture_year,
  versionName: row.version_name,
  catalogVariantId: row.catalog_variant_id,
  catalogRevision: row.catalog_revision,
  archivedAt: row.archived_at,
  isPrimary: row.is_primary,
  photoUrl: row.photo_ref ? `/motorcycles/${row.id}/photo` : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const visible = (row: MotorcycleRow) => ({
  id: row.id,
  brand: row.brand,
  model: row.model,
  year: row.year,
  displacementCc:
    row.displacement_cc === null ? null : Number(row.displacement_cc),
  isPrimary: row.is_primary,
  photoUrl: row.photo_ref ? `/motorcycles/${row.id}/photo` : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const notFound = () => new AuthError(404, 'Moto não encontrada.');

export async function motorcycleRoutes(
  app: FastifyInstance,
  options: {
    config: Config;
    pool?: Pool | undefined;
    storage?: PhotoStorage | undefined;
  },
) {
  const { config } = options;
  const db = () => {
    if (!options.pool) throw new AuthError(503, 'Serviço indisponível.');
    return options.pool;
  };
  const principal = createPrincipal(config, db);
  const storage =
    options.storage ?? new LocalPhotoStorage(config.motorcycleStorageDir);
  app.addHook('onRequest', sessionGuard(config));
  const owners = new WeakMap<FastifyRequest, string>();
  const identify = async (request: FastifyRequest) => {
    owners.set(
      request,
      (await principal(request, request.method !== 'GET')).user.id,
    );
  };
  const owner = (request: FastifyRequest) => owners.get(request)!;
  const id = (request: FastifyRequest) =>
    motorcycleId((request.params as { id: string }).id);
  async function own(
    client: Pool | PoolClient,
    bikeId: string,
    userId: string,
    includeArchived = false,
  ) {
    const result = await client.query(
      'SELECT * FROM motorcycles WHERE id=$1 AND owner_id=$2 AND ($3 OR archived_at IS NULL)',
      [bikeId, userId, includeArchived],
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0] as MotorcycleRow;
  }
  async function transaction<T>(
    userId: string,
    action: (client: PoolClient) => Promise<T>,
  ) {
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      // Mesmo lock usado por cadastro/login e alterações sensíveis de conta.
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        userId,
      ]);
      const value = await action(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async function queue(client: PoolClient, key: string | null) {
    if (key)
      await client.query(
        `INSERT INTO motorcycle_photo_cleanup(photo_ref) VALUES($1)
      ON CONFLICT(photo_ref) DO UPDATE SET available_at=now()`,
        [key],
      );
  }
  let cleaning: Promise<void> | undefined;
  function clean() {
    if (!options.pool) return Promise.resolve();
    cleaning ??= cleanupPhotos(options.pool, storage)
      .catch(() => {
        app.log.error(
          { event: 'motorcycle_photo_cleanup_failed' },
          'Limpeza de fotografias pendente',
        );
      })
      .finally(() => {
        cleaning = undefined;
      });
    return cleaning;
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    void clean();
    timer = setInterval(() => void clean(), 60_000);
    timer.unref();
  });
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await cleaning;
  });

  registerCatalog(app, db);
  registerGarageRecords(app, { db, identify, owner, own, transaction });
  registerPermanentMotorcycleDeletion(app, {
    identify,
    owner,
    own,
    transaction,
    queue,
    clean,
  });
  app.get('/motorcycles', { onRequest: identify }, async (request) => ({
    status: 'ok',
    motorcycles: (
      await db().query(
        `SELECT * FROM motorcycles
      WHERE owner_id=$1 AND (CASE WHEN $2 THEN archived_at IS NOT NULL ELSE archived_at IS NULL END) ORDER BY is_primary DESC,created_at,id`,
        [
          owner(request),
          (request.query as { archived?: string }).archived === 'true',
        ],
      )
    ).rows.map(privateVisible),
  }));
  app.get('/motorcycles/primary', { onRequest: identify }, async (request) => ({
    status: 'ok',
    motorcycle:
      (
        await db().query(
          'SELECT * FROM motorcycles WHERE owner_id=$1 AND is_primary AND archived_at IS NULL',
          [owner(request)],
        )
      ).rows.map(privateVisible)[0] ?? null,
  }));
  app.post('/motorcycles', { onRequest: identify }, async (request, reply) => {
    const b = motorcycleData(request.body);
    const row = await transaction(owner(request), async (client) => {
      const v = await resolveIdentity(client, b);
      const result = await client.query(
        `INSERT INTO motorcycles(id,owner_id,brand,model,year,displacement_cc,is_primary,propulsion,manufacture_year,version_name,catalog_variant_id,catalog_revision)
        VALUES($1,$2,$3,$4,$5,$6,NOT EXISTS(SELECT 1 FROM motorcycles WHERE owner_id=$2 AND archived_at IS NULL),$7,$8,$9,$10,$11) RETURNING *`,
        [
          randomUUID(),
          owner(request),
          v.brand,
          v.model,
          v.year,
          v.cc,
          v.propulsion,
          v.manufactureYear,
          v.versionName,
          v.variant,
          v.revision,
        ],
      );
      await recordIdentity(client, result.rows[0]);
      await reconcileUser(client, owner(request));
      return result.rows[0] as MotorcycleRow;
    });
    return reply
      .code(201)
      .send({ status: 'ok', motorcycle: privateVisible(row) });
  });
  app.get('/motorcycles/:id', { onRequest: identify }, async (request) => ({
    status: 'ok',
    motorcycle: privateVisible(
      await own(
        db(),
        id(request),
        owner(request),
        (request.query as { archived?: string }).archived === 'true',
      ),
    ),
  }));
  app.patch('/motorcycles/:id', { onRequest: identify }, async (request) => {
    const b = motorcycleData(request.body, true);
    const row = await transaction(owner(request), async (client) => {
      const current = await own(client, id(request), owner(request));
      const v = await resolveIdentity(client, b, current);
      const result = await client.query(
        `UPDATE motorcycles SET brand=$1,model=$2,year=$3,displacement_cc=$4,propulsion=$5,manufacture_year=$6,version_name=$7,catalog_variant_id=$8,catalog_revision=$9,updated_at=now() WHERE id=$10 RETURNING *`,
        [
          v.brand,
          v.model,
          v.year,
          v.cc,
          v.propulsion,
          v.manufactureYear,
          v.versionName,
          v.variant,
          v.revision,
          current.id,
        ],
      );
      await recordIdentity(client, result.rows[0]);
      return result.rows[0] as MotorcycleRow;
    });
    return { status: 'ok', motorcycle: privateVisible(row) };
  });
  app.patch(
    '/motorcycles/:id/primary',
    { onRequest: identify },
    async (request) => {
      const row = await transaction(owner(request), async (client) => {
        const current = await own(client, id(request), owner(request));
        await client.query(
          'UPDATE motorcycles SET is_primary=false,updated_at=now() WHERE owner_id=$1 AND is_primary',
          [owner(request)],
        );
        const result = await client.query(
          'UPDATE motorcycles SET is_primary=true,updated_at=now() WHERE id=$1 RETURNING *',
          [current.id],
        );
        return result.rows[0] as MotorcycleRow;
      });
      return { status: 'ok', motorcycle: privateVisible(row) };
    },
  );
  app.delete('/motorcycles/:id', { onRequest: identify }, async (request) => {
    await transaction(owner(request), async (client) => {
      const current = await own(client, id(request), owner(request));
      await client.query(
        `UPDATE motorcycles SET archived_at=now(),updated_at=now(),is_primary=false,
        photo_ref=NULL,photo_bytes=NULL,photo_width=NULL,photo_height=NULL WHERE id=$1`,
        [current.id],
      );
      await queue(client, current.photo_ref);
      if (current.is_primary)
        await client.query(
          `UPDATE motorcycles SET is_primary=true,updated_at=now() WHERE id=(
        SELECT id FROM motorcycles WHERE owner_id=$1 AND archived_at IS NULL ORDER BY created_at,id LIMIT 1)`,
          [owner(request)],
        );
    });
    await clean();
    return { status: 'ok' };
  });

  app.addContentTypeParser(
    [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/octet-stream',
      'image/heic',
      'image/heif',
      'image/svg+xml',
    ],
    { parseAs: 'buffer', bodyLimit: MAX_PHOTO_BYTES },
    (_request, body, done) => done(null, body),
  );
  app.post(
    '/motorcycles/:id/photo',
    { bodyLimit: MAX_PHOTO_BYTES, onRequest: identify },
    async (request) => {
      // Verifica propriedade antes da decodificação e novamente dentro da transação.
      await own(db(), id(request), owner(request));
      const { data, info } = await optimizePhoto(request.body);
      const key = `${randomUUID()}.webp`;
      // Registro durável anterior à escrita cobre falha/crash entre filesystem e COMMIT.
      await db().query(
        "INSERT INTO motorcycle_photo_cleanup(photo_ref,available_at) VALUES($1,now()+interval '1 hour')",
        [key],
      );
      let row: MotorcycleRow;
      try {
        await storage.put(key, data);
        row = await transaction(owner(request), async (client) => {
          const pending = await client.query(
            'SELECT photo_ref FROM motorcycle_photo_cleanup WHERE photo_ref=$1 FOR UPDATE',
            [key],
          );
          if (!pending.rowCount) throw new Error('Upload expirado');
          const current = await own(client, id(request), owner(request));
          const result = await client.query(
            `UPDATE motorcycles SET photo_ref=$1,photo_bytes=$2,photo_width=$3,photo_height=$4,updated_at=now()
          WHERE id=$5 RETURNING *`,
            [key, info.size, info.width, info.height, current.id],
          );
          await queue(client, current.photo_ref);
          await client.query(
            'DELETE FROM motorcycle_photo_cleanup WHERE photo_ref=$1',
            [key],
          );
          return result.rows[0] as MotorcycleRow;
        });
      } catch (error) {
        await db().query(
          'UPDATE motorcycle_photo_cleanup SET available_at=now() WHERE photo_ref=$1',
          [key],
        );
        await clean();
        if (error instanceof AuthError) throw error;
        throw new AuthError(
          503,
          'Não foi possível armazenar a fotografia. Tente novamente.',
        );
      }
      await clean();
      return { status: 'ok', motorcycle: privateVisible(row) };
    },
  );
  app.delete(
    '/motorcycles/:id/photo',
    { onRequest: identify },
    async (request) => {
      const row = await transaction(owner(request), async (client) => {
        const current = await own(client, id(request), owner(request));
        const result = await client.query(
          `UPDATE motorcycles SET photo_ref=NULL,photo_bytes=NULL,photo_width=NULL,photo_height=NULL,updated_at=now() WHERE id=$1 RETURNING *`,
          [current.id],
        );
        await queue(client, current.photo_ref);
        return result.rows[0] as MotorcycleRow;
      });
      await clean();
      return { status: 'ok', motorcycle: privateVisible(row) };
    },
  );
  app.get('/motorcycles/:id/photo', async (request, reply) => {
    let viewer: string | null = null;
    // Uma sessão inválida nunca concede acesso; leitura pública continua anônima.
    try {
      viewer = (await principal(request)).user.id;
    } catch (error) {
      if (!(error instanceof AuthError && error.statusCode === 401))
        throw error;
    }
    const result = await db().query(
      `SELECT m.photo_ref FROM motorcycles m JOIN users u ON u.id=m.owner_id
      JOIN privacy_settings p ON p.user_id=u.id WHERE m.id=$1 AND m.archived_at IS NULL
      AND u.account_status='active' AND (u.id=$2 OR p.profile_visibility='public') AND ${notBlocked('u.id', '$2')}`,
      [id(request), viewer],
    );
    const key = result.rows[0]?.photo_ref as string | undefined;
    if (!key) throw notFound();
    let bytes: Buffer;
    try {
      bytes = await storage.get(key);
    } catch {
      throw new AuthError(503, 'Fotografia temporariamente indisponível.');
    }
    return reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cross-Origin-Resource-Policy', 'same-site')
      .type('image/webp')
      .send(bytes);
  });
  app.get('/users/:username/motorcycles', async (request) => {
    const name = username((request.params as { username: string }).username);
    let viewer: string | null = null;
    try {
      viewer = (await principal(request)).user.id;
    } catch (error) {
      if (!(error instanceof AuthError && error.statusCode === 401))
        throw error;
    }
    const result = await db().query(
      `SELECT u.id FROM users u JOIN privacy_settings p ON p.user_id=u.id
      WHERE u.username=$1 AND u.account_status='active' AND p.profile_visibility='public' AND ${notBlocked('u.id', '$2')}`,
      [name, viewer],
    );
    if (!result.rows[0]) throw new AuthError(404, 'Perfil não encontrado.');
    const rows = await db().query(
      `SELECT * FROM motorcycles WHERE owner_id=$1 AND archived_at IS NULL ORDER BY is_primary DESC,created_at,id`,
      [result.rows[0].id],
    );
    return { status: 'ok', motorcycles: rows.rows.map(visible) };
  });
}
import { reconcileUser } from '../gamification/engine.js';
