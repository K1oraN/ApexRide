import {
  localDatabase,
  requestResult,
  type LocalDatabase,
} from '../offline/database';
import type { VideoAnchor, VideoChunk, VideoSegment } from './types';
const chunkRange = (id: string) =>
  IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
export class VideoStorageRepository {
  constructor(readonly db: LocalDatabase = localDatabase) {}
  list(ownerId: string, clientId?: string): Promise<VideoSegment[]> {
    return this.db.transaction(['video_segments'], 'readonly', (tx) =>
      requestResult(
        clientId
          ? tx
              .objectStore('video_segments')
              .index('activity')
              .getAll([ownerId, clientId])
          : tx.objectStore('video_segments').index('owner').getAll(ownerId),
      ),
    );
  }
  create(segment: VideoSegment) {
    return this.db.transaction(['video_segments'], 'readwrite', async (tx) => {
      const store = tx.objectStore('video_segments');
      const rows = await requestResult<VideoSegment[]>(
        store.index('activity').getAll([segment.ownerId, segment.clientId]),
      );
      if (
        rows.some(
          (row) => row.state === 'writing' && row.leaseUntil > Date.now(),
        )
      )
        throw new Error(
          'Esta atividade já possui um gravador ativo em outra aba.',
        );
      const order = Math.max(-1, ...rows.map((r) => r.order)) + 1;
      store.add({ ...segment, order });
      return order;
    });
  }
  private async owned(tx: IDBTransaction, owner: string, id: string) {
    const row = await requestResult<VideoSegment | undefined>(
      tx.objectStore('video_segments').get(id),
    );
    if (!row || row.ownerId !== owner)
      throw new Error('Vídeo local não encontrado nesta conta.');
    return row;
  }
  start(
    owner: string,
    id: string,
    writer: string,
    start: VideoAnchor,
    mimeType: string,
  ) {
    return this.db.transaction(['video_segments'], 'readwrite', async (tx) => {
      const row = await this.owned(tx, owner, id);
      if (row.writer !== writer || row.state !== 'writing')
        throw new Error('Gravador local encerrado.');
      tx.objectStore('video_segments').put({ ...row, start, mimeType });
    });
  }
  append(owner: string, id: string, writer: string, chunk: VideoChunk) {
    if (!chunk.blob.size) return Promise.resolve();
    return this.db.transaction(
      ['video_segments', 'video_chunks'],
      'readwrite',
      async (tx) => {
        const row = await this.owned(tx, owner, id);
        if (
          row.writer !== writer ||
          row.state !== 'writing' ||
          chunk.segmentId !== id
        )
          throw new Error('Segmento não está disponível para escrita.');
        const store = tx.objectStore('video_chunks');
        if (await requestResult(store.getKey([id, chunk.order]))) return; // Retry is idempotent.
        if (row.chunks !== chunk.order)
          throw new Error('Sequência de vídeo incompleta.');
        store.add(chunk);
        tx.objectStore('video_segments').put({
          ...row,
          chunks: row.chunks + 1,
          bytes: row.bytes + chunk.blob.size,
          lastReceivedAt: chunk.receivedAt,
          leaseUntil: Date.now() + 30_000,
        });
      },
    );
  }
  heartbeat(owner: string, id: string, writer: string) {
    return this.db.transaction(['video_segments'], 'readwrite', async (tx) => {
      const row = await this.owned(tx, owner, id);
      if (row.state !== 'writing' || row.writer !== writer)
        throw new Error('Gravador local encerrado.');
      tx.objectStore('video_segments').put({
        ...row,
        leaseUntil: Date.now() + 30_000,
      });
    });
  }
  reopen(owner: string, id: string, writer: string) {
    return this.db.transaction(['video_segments'], 'readwrite', async (tx) => {
      const row = await this.owned(tx, owner, id);
      const store = tx.objectStore('video_segments');
      const rows = await requestResult<VideoSegment[]>(
        store.index('activity').getAll([owner, row.clientId]),
      );
      if (
        row.writer !== writer ||
        row.state !== 'incomplete' ||
        rows.some((r) => r.state === 'writing' && r.leaseUntil > Date.now())
      )
        throw new Error(
          'O segmento não pode ser reaberto para retentativa agora.',
        );
      store.put({ ...row, state: 'writing', leaseUntil: Date.now() + 30_000 });
    });
  }
  finish(
    owner: string,
    id: string,
    writer: string,
    end: VideoAnchor | null,
    complete: boolean,
    reason: string,
    mimeType: string,
  ) {
    return this.db.transaction(['video_segments'], 'readwrite', async (tx) => {
      const row = await this.owned(tx, owner, id);
      if (row.writer !== writer || row.state !== 'writing') return;
      const duration =
        row.start && end ? end.monotonicMs - row.start.monotonicMs : null;
      const valid =
        duration !== null &&
        Number.isFinite(duration) &&
        duration >= 0 &&
        end!.rideElapsedMs >= row.start!.rideElapsedMs;
      tx.objectStore('video_segments').put({
        ...row,
        end,
        mimeType: mimeType || row.mimeType,
        state: complete && row.chunks > 0 && valid ? 'complete' : 'incomplete',
        durationEstimatedMs: valid ? duration : null,
        reason,
        leaseUntil: 0,
      });
    });
  }
  recover(owner: string, now = Date.now(), validate = false) {
    return this.db.transaction(
      ['video_segments', 'video_chunks'],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore('video_segments');
        const rows = await requestResult<VideoSegment[]>(
          store.index('owner').getAll(owner),
        );
        for (const row of rows)
          if (row.state === 'writing' && row.leaseUntil < now)
            store.put({
              ...row,
              state: 'incomplete',
              reason:
                'Página encerrada ou captura sem confirmação final; duração desconhecida.',
              leaseUntil: 0,
            });
        if (validate)
          for (const row of rows)
            if (row.state === 'complete') {
              let count = 0,
                bytes = 0,
                valid = true;
              await new Promise<void>((resolve, reject) => {
                const request = tx
                  .objectStore('video_chunks')
                  .openCursor(chunkRange(row.id));
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                  const cursor = request.result;
                  if (!cursor) {
                    resolve();
                    return;
                  }
                  const chunk = cursor.value as VideoChunk;
                  valid &&= chunk.order === count && chunk.blob?.size > 0;
                  bytes += chunk.blob?.size ?? 0;
                  count++;
                  cursor.continue();
                };
              });
              if (!valid || count !== row.chunks || bytes !== row.bytes)
                store.put({
                  ...row,
                  state: 'incomplete',
                  reason: 'Arquivo local removido ou chunks inconsistentes.',
                });
            }
      },
    );
  }
  link(owner: string, clientId: string, serverId: string) {
    return this.db.transaction(['video_segments'], 'readwrite', async (tx) => {
      const store = tx.objectStore('video_segments');
      const rows = await requestResult<VideoSegment[]>(
        store.index('activity').getAll([owner, clientId]),
      );
      for (const row of rows)
        if (row.serverId !== serverId) store.put({ ...row, serverId });
    });
  }
  remove(owner: string, clientId: string) {
    return this.db.transaction(
      [
        'video_segments',
        'video_chunks',
        'video_overlay_configs',
        'video_exports',
        'video_export_chunks',
      ],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore('video_segments');
        const rows = await requestResult<VideoSegment[]>(
          store.index('activity').getAll([owner, clientId]),
        );
        if (
          rows.some((r) => r.state === 'writing' && r.leaseUntil > Date.now())
        )
          throw new Error(
            'Aguarde o encerramento da gravação antes de excluir.',
          );
        for (const row of rows) {
          tx.objectStore('video_chunks').delete(chunkRange(row.id));
          store.delete(row.id);
        }
        const configs = tx.objectStore('video_overlay_configs');
        const keys = await requestResult<IDBValidKey[]>(
          configs.index('activity').getAllKeys([owner, clientId]),
        );
        keys.forEach((key) => configs.delete(key));
        const exports = tx.objectStore('video_exports');
        const jobs = await requestResult<{ id: string }[]>(
          exports.index('activity').getAll([owner, clientId]),
        );
        for (const job of jobs) {
          exports.delete(job.id);
          tx.objectStore('video_export_chunks').delete(
            IDBKeyRange.bound([job.id, 0], [job.id, Number.MAX_SAFE_INTEGER]),
          );
        }
      },
    );
  }
  async blob(owner: string, id: string, recoverable = false) {
    return this.db.transaction(
      ['video_segments', 'video_chunks'],
      'readonly',
      async (tx) => {
        const row = await this.owned(tx, owner, id);
        if (
          row.state !== 'complete' &&
          !(recoverable && row.state === 'incomplete')
        )
          throw new Error(
            'Arquivo incompleto; reprodução não confirmada. Os dados recuperáveis foram preservados.',
          );
        // Deliberately bounded playback assembly; capture itself has no duration cap.
        if (row.bytes > 256 * 1024 * 1024)
          throw new Error(
            'Este segmento excede 256 MB. A montagem para reprodução/cópia neste navegador foi limitada para proteger a memória. Os chunks permanecem no aparelho.',
          );
        const chunks = await requestResult<VideoChunk[]>(
          tx.objectStore('video_chunks').getAll(chunkRange(id)),
        );
        if (recoverable && row.state === 'incomplete') {
          const prefix: Blob[] = [];
          let prefixBytes = 0;
          for (const c of chunks) {
            if (c.order !== prefix.length || !c.blob.size) break;
            prefixBytes += c.blob.size;
            if (prefixBytes > 256 * 1024 * 1024)
              throw new Error(
                'Trecho recuperável excede 256 MiB. Os chunks foram preservados.',
              );
            prefix.push(c.blob);
          }
          if (!prefix.length)
            throw new Error('Nenhum trecho contíguo recuperável.');
          return new Blob(prefix, { type: row.mimeType });
        }
        if (
          chunks.length !== row.chunks ||
          chunks.some((c, i) => c.order !== i || !c.blob.size) ||
          chunks.reduce((n, c) => n + c.blob.size, 0) !== row.bytes
        )
          throw new Error('Arquivo local removido ou incompleto.');
        return new Blob(
          chunks.map((c) => c.blob),
          { type: row.mimeType },
        );
      },
    );
  }
  mediaDuration(owner: string, id: string, duration: number) {
    if (!Number.isFinite(duration) || duration <= 0) return Promise.resolve();
    return this.db.transaction(['video_segments'], 'readwrite', async (tx) => {
      const row = await this.owned(tx, owner, id);
      tx.objectStore('video_segments').put({
        ...row,
        mediaDurationMs: duration,
      });
    });
  }
}
export const videoRepository = new VideoStorageRepository();
