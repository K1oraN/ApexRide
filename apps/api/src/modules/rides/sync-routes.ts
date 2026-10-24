import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { RidePayload } from '@apex-ride/ride-core';
import type { createPrincipal } from '../auth/session.js';
import { AuthError } from '../auth/validation.js';
import { uuid } from './validation.js';
import { persistRide } from './persist.js';

const names = ['points', 'motion', 'speed', 'events'] as const;
const maxima = { points: 50_000, motion: 18_000, speed: 18_000, events: 2000 };
type Name = (typeof names)[number];
interface Manifest {
  version: 1;
  meta: RidePayload;
  counts: Record<Name, number>;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const hash = (body: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(body)))
    .digest('hex');
const invalid = () =>
  new AuthError(400, 'Manifesto ou lote de sincronização inválido.');
export function validateManifest(value: unknown, id: string): Manifest {
  const m = value as Manifest;
  if (
    !m ||
    m.version !== 1 ||
    !m.meta ||
    m.meta.clientId !== id ||
    !m.counts ||
    names.some(
      (n) =>
        !Number.isSafeInteger(m.counts[n]) ||
        m.counts[n] < 0 ||
        m.counts[n] > maxima[n],
    ) ||
    m.counts.points < 1 ||
    !Array.isArray(m.meta.points) ||
    m.meta.points.length ||
    (m.meta.motion &&
      (!Array.isArray(m.meta.motion.samples) ||
        m.meta.motion.samples.length)) ||
    (m.meta.speedProcessing &&
      (!Array.isArray(m.meta.speedProcessing.samples) ||
        m.meta.speedProcessing.samples.length)) ||
    (m.meta.telemetry &&
      (!Array.isArray(m.meta.telemetry.events) ||
        m.meta.telemetry.events.length)) ||
    (!m.meta.motion && m.counts.motion) ||
    (!m.meta.speedProcessing && m.counts.speed) ||
    (!m.meta.telemetry && m.counts.events)
  )
    throw invalid();
  return m;
}
export function registerSyncRoutes(
  app: FastifyInstance,
  db: () => Pool,
  principal: ReturnType<typeof createPrincipal>,
) {
  async function notDeleted(owner: string, id: string) {
    if (
      (
        await db().query(
          'SELECT client_id FROM ride_deletions WHERE owner_id=$1 AND client_id=$2',
          [owner, id],
        )
      ).rowCount
    )
      throw new AuthError(410, 'Atividade excluída. O envio foi cancelado.');
  }
  app.post(
    '/rides/sync/:clientId',
    { bodyLimit: 1024 * 1024 },
    async (request) => {
      const { user } = await principal(request, true);
      const id = (request.params as { clientId: string }).clientId;
      if (!uuid(id)) throw invalid();
      await notDeleted(user.id, id);
      const manifest = validateManifest(request.body, id);
      const fingerprint = hash(manifest);
      await db().query(
        `INSERT INTO ride_uploads(owner_id,client_id,manifest,manifest_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [user.id, id, JSON.stringify(manifest), fingerprint],
      );
      const row = (
        await db().query(
          'SELECT manifest_hash FROM ride_uploads WHERE owner_id=$1 AND client_id=$2',
          [user.id, id],
        )
      ).rows[0];
      if (row.manifest_hash !== fingerprint)
        throw new AuthError(
          409,
          'O identificador de envio já contém outros dados.',
        );
      const batches = await db().query(
        'SELECT batch_index FROM ride_upload_batches WHERE owner_id=$1 AND client_id=$2 ORDER BY batch_index',
        [user.id, id],
      );
      return {
        status: 'ok',
        received: batches.rows.map((r) => r.batch_index as number),
      };
    },
  );
  app.post(
    '/rides/sync/:clientId/batches/:index',
    { bodyLimit: 1024 * 1024 },
    async (request) => {
      const { user } = await principal(request, true);
      const { clientId: id, index: rawIndex } = request.params as {
        clientId: string;
        index: string;
      };
      if (!uuid(id)) throw invalid();
      await notDeleted(user.id, id);
      const index = Number(rawIndex);
      const upload = (
        await db().query(
          'SELECT manifest FROM ride_uploads WHERE owner_id=$1 AND client_id=$2',
          [user.id, id],
        )
      ).rows[0];
      if (!upload)
        throw new AuthError(404, 'Envio não encontrado nesta conta.');
      const m = upload.manifest as Manifest;
      const total = Math.ceil(Math.max(...names.map((n) => m.counts[n])) / 500);
      const body = request.body as Record<Name, unknown[]>;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= total ||
        !body ||
        names.some(
          (n) =>
            !Array.isArray(body[n]) ||
            body[n].length !==
              Math.max(0, Math.min(500, m.counts[n] - index * 500)),
        )
      )
        throw invalid();
      const fingerprint = hash(body);
      await db().query(
        `INSERT INTO ride_upload_batches(owner_id,client_id,batch_index,body,body_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [user.id, id, index, JSON.stringify(body), fingerprint],
      );
      const row = (
        await db().query(
          'SELECT body_hash FROM ride_upload_batches WHERE owner_id=$1 AND client_id=$2 AND batch_index=$3',
          [user.id, id, index],
        )
      ).rows[0];
      if (row.body_hash !== fingerprint)
        throw new AuthError(409, 'Lote repetido com conteúdo diferente.');
      return { status: 'ok', index };
    },
  );
  app.post('/rides/sync/:clientId/complete', async (request) => {
    const { user } = await principal(request, true);
    const id = (request.params as { clientId: string }).clientId;
    if (!uuid(id)) throw invalid();
    await notDeleted(user.id, id);
    const upload = (
      await db().query(
        'SELECT manifest FROM ride_uploads WHERE owner_id=$1 AND client_id=$2',
        [user.id, id],
      )
    ).rows[0];
    if (!upload) throw new AuthError(404, 'Envio não encontrado nesta conta.');
    const m = upload.manifest as Manifest;
    const rows = (
      await db().query(
        'SELECT batch_index,body FROM ride_upload_batches WHERE owner_id=$1 AND client_id=$2 ORDER BY batch_index',
        [user.id, id],
      )
    ).rows;
    if (
      rows.length !==
        Math.ceil(Math.max(...names.map((n) => m.counts[n])) / 500) ||
      rows.some((r, i) => r.batch_index !== i)
    )
      throw new AuthError(
        409,
        'Existem lotes pendentes. Continue o envio antes de concluir.',
      );
    const b = m.meta;
    b.points = rows.flatMap((r) => r.body.points);
    if (b.motion) b.motion.samples = rows.flatMap((r) => r.body.motion);
    if (b.speedProcessing)
      b.speedProcessing.samples = rows.flatMap((r) => r.body.speed);
    if (b.telemetry) b.telemetry.events = rows.flatMap((r) => r.body.events);
    const confirmation = await persistRide(db(), user.id, b);
    // Retain manifest/batch receipts: a lost completion response can safely be retried.
    return confirmation;
  });
}
