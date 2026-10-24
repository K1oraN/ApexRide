import {
  localDatabase,
  requestResult,
  type LocalDatabase,
} from '../../offline/database';
import type { VideoSegment } from '../types';
import { validConfig, type OverlayConfig } from './config';
export const MAX_EXPORT_BYTES = 128 * 1024 * 1024;
export interface ExportRecord {
  id: string;
  ownerId: string;
  clientId: string;
  segmentId: string;
  config: OverlayConfig;
  createdAt: number;
  mimeType: string;
  width: number;
  height: number;
  duration: number;
  audio: boolean;
  bytes: number;
  chunks: number;
  leaseUntil: number;
  state: 'encoding' | 'complete';
}
const range = (id: string) =>
  IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
export class OverlayRepository {
  constructor(readonly db: LocalDatabase = localDatabase) {}
  private async owned(tx: IDBTransaction, owner: string, segmentId: string) {
    const row = await requestResult<VideoSegment | undefined>(
      tx.objectStore('video_segments').get(segmentId),
    );
    if (!row || row.ownerId !== owner)
      throw new Error('Vídeo local não encontrado nesta conta.');
    return row;
  }
  async config(owner: string, segmentId: string) {
    return this.db.transaction(
      ['video_segments', 'video_overlay_configs'],
      'readonly',
      async (tx) => {
        await this.owned(tx, owner, segmentId);
        const row = await requestResult<{ config: unknown } | undefined>(
          tx.objectStore('video_overlay_configs').get([owner, segmentId]),
        );
        return validConfig(row?.config) ? row.config : null;
      },
    );
  }
  saveConfig(owner: string, config: OverlayConfig) {
    if (!validConfig(config))
      throw new Error('Configuração de overlay inválida.');
    return this.db.transaction(
      ['video_segments', 'video_overlay_configs'],
      'readwrite',
      async (tx) => {
        const row = await this.owned(tx, owner, config.segmentId);
        const store = tx.objectStore('video_overlay_configs');
        store.put({
          ownerId: owner,
          segmentId: row.id,
          clientId: row.clientId,
          config,
        });
        // Reusable preference deliberately excludes per-file alignment and audio consent.
        store.put({
          ownerId: owner,
          segmentId: '*',
          clientId: '*',
          config: { ...config, segmentId: '*', offsetMs: 0, audio: false },
        });
      },
    );
  }
  preference(owner: string) {
    return this.db.transaction(
      ['video_overlay_configs'],
      'readonly',
      async (tx) => {
        const row = await requestResult<{ config: unknown } | undefined>(
          tx.objectStore('video_overlay_configs').get([owner, '*']),
        );
        return validConfig(row?.config) ? row.config : null;
      },
    );
  }
  begin(record: ExportRecord) {
    return this.db.transaction(
      ['video_segments', 'video_exports', 'video_export_chunks'],
      'readwrite',
      async (tx) => {
        const segment = await this.owned(tx, record.ownerId, record.segmentId);
        if (segment.clientId !== record.clientId)
          throw new Error('Atividade de vídeo inválida.');
        const store = tx.objectStore('video_exports');
        const jobs = await requestResult<ExportRecord[]>(store.getAll());
        if (
          jobs.some((j) => j.state === 'encoding' && j.leaseUntil > Date.now())
        )
          throw new Error('Já existe uma exportação em andamento.');
        for (const j of jobs)
          if (j.state === 'encoding') {
            store.delete(j.id);
            tx.objectStore('video_export_chunks').delete(range(j.id));
          }
        store.add(record);
      },
    );
  }
  append(owner: string, id: string, chunk: Blob) {
    return this.db.transaction(
      ['video_exports', 'video_export_chunks'],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore('video_exports');
        const job = await requestResult<ExportRecord | undefined>(
          store.get(id),
        );
        if (!job || job.ownerId !== owner || job.state !== 'encoding')
          throw new Error('Exportação encerrada.');
        if (job.bytes + chunk.size > MAX_EXPORT_BYTES)
          throw new Error(
            'Exportação excedeu 128 MiB; escolha qualidade menor.',
          );
        tx.objectStore('video_export_chunks').add({
          exportId: id,
          order: job.chunks,
          blob: chunk,
        });
        store.put({
          ...job,
          bytes: job.bytes + chunk.size,
          chunks: job.chunks + 1,
          leaseUntil: Date.now() + 60000,
        });
      },
    );
  }
  list(owner: string, clientId: string) {
    return this.db.transaction(['video_exports'], 'readonly', async (tx) =>
      (
        await requestResult<ExportRecord[]>(
          tx
            .objectStore('video_exports')
            .index('activity')
            .getAll([owner, clientId]),
        )
      ).filter((j) => j.state === 'complete'),
    );
  }
  blob(owner: string, id: string) {
    return this.db.transaction(
      ['video_exports', 'video_export_chunks', 'video_segments'],
      'readonly',
      async (tx) => {
        const job = await requestResult<ExportRecord | undefined>(
          tx.objectStore('video_exports').get(id),
        );
        if (!job || job.ownerId !== owner)
          throw new Error('Exportação não encontrada nesta conta.');
        await this.owned(tx, owner, job.segmentId);
        const chunks = await requestResult<{ order: number; blob: Blob }[]>(
          tx.objectStore('video_export_chunks').getAll(range(id)),
        );
        if (
          !job.bytes ||
          job.bytes > MAX_EXPORT_BYTES ||
          chunks.length !== job.chunks ||
          chunks.some((c, i) => c.order !== i) ||
          chunks.reduce((n, c) => n + c.blob.size, 0) !== job.bytes
        )
          throw new Error('Exportação incompleta.');
        return new Blob(
          chunks.map((c) => c.blob),
          { type: job.mimeType },
        );
      },
    );
  }
  complete(
    owner: string,
    id: string,
    verified?: { duration: number; width: number; height: number },
  ) {
    return this.db.transaction(
      ['video_exports', 'video_segments'],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore('video_exports');
        const job = await requestResult<ExportRecord | undefined>(
          store.get(id),
        );
        if (!job || job.ownerId !== owner || !job.bytes)
          throw new Error('Exportação incompleta.');
        await this.owned(tx, owner, job.segmentId);
        const complete = {
          ...job,
          ...verified,
          state: 'complete' as const,
          leaseUntil: 0,
        };
        store.put(complete);
        return complete;
      },
    );
  }
  remove(owner: string, id: string) {
    return this.db.transaction(
      ['video_exports', 'video_export_chunks'],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore('video_exports');
        const job = await requestResult<ExportRecord | undefined>(
          store.get(id),
        );
        if (job?.ownerId !== owner) return;
        store.delete(id);
        tx.objectStore('video_export_chunks').delete(range(id));
      },
    );
  }
}
export const overlayRepository = new OverlayRepository();
