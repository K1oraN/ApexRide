import {
  calculateMetrics,
  type RidePayload,
  type RideMetrics,
} from '@apex-ride/ride-core';
import type { Activity, RideSnapshot } from '../ride/controller';
import {
  LocalDatabase,
  localDatabase,
  requestResult,
  sampleStores,
} from './database';
import type { SaveConfirmation } from '../services/rides';

export type SyncState =
  | 'pending'
  | 'sending'
  | 'partial'
  | 'auth'
  | 'temporary'
  | 'permanent'
  | 'confirmed';
export interface QueueItem {
  id: string;
  ownerId: string;
  state: SyncState;
  attempts: number;
  lastAttempt: number | null;
  nextAttempt: number;
  error: string | null;
  received: number[];
  serverId: string | null;
}
export interface LocalSession {
  history?: { metrics: RideMetrics };
  id: string;
  version: 1;
  ownerId: string;
  bike: Activity['bike'];
  state: RideSnapshot['state'];
  payload: RidePayload;
  activeStart: number | null;
  recordedAt: number;
  counts: number[];
  writer: string;
  leaseUntil: number;
  decision: 'review' | 'save';
  confirmation?: SaveConfirmation;
}
const key = (owner: string, clientId: string) => `${owner}:${clientId}`;
export function splitPayload(payload: RidePayload) {
  const series = [
    payload.points,
    payload.motion?.samples ?? [],
    payload.speedProcessing?.samples ?? [],
    payload.telemetry?.events ?? [],
  ];
  const meta: RidePayload = {
    ...payload,
    points: [],
    ...(payload.motion ? { motion: { ...payload.motion, samples: [] } } : {}),
    ...(payload.speedProcessing
      ? { speedProcessing: { ...payload.speedProcessing, samples: [] } }
      : {}),
    ...(payload.telemetry
      ? { telemetry: { ...payload.telemetry, events: [] } }
      : {}),
  };
  return { series, meta };
}
export class OfflineSessionRepository {
  constructor(readonly db: LocalDatabase = localDatabase) {}
  async checkpoint(
    activity: Activity,
    state: RideSnapshot['state'],
    writer: string,
    now: number,
  ) {
    const id = key(activity.ownerId, activity.payload.clientId);
    const { series, meta } = splitPayload(activity.payload);
    const counts = series.map((s) => s.length);
    // Only new samples enter the transaction. Existing arrays stay in their owning services.
    return this.db.transaction(
      ['offline_sessions', 'sync_metadata', ...sampleStores],
      'readwrite',
      async (tx) => {
        if (
          await requestResult(
            tx.objectStore('sync_metadata').get(`deleted:${id}`),
          )
        )
          throw new Error('Esta atividade foi descartada neste aparelho.');
        const store = tx.objectStore('offline_sessions');
        const old = await requestResult<LocalSession | undefined>(
          store.get(id),
        );
        if (old?.decision === 'save') return;
        if (old && old.writer !== writer && old.leaseUntil > now)
          throw new Error('Esta sessão está aberta em outra aba.');
        for (let n = 0; n < series.length; n++) {
          const values = series[n]!;
          const start = old?.counts[n] ?? 0;
          // Final processing can filter the selected speed series; replace just that series.
          const reset =
            counts[n]! < start ||
            (state === 'finished' &&
              old?.state !== 'finished' &&
              (n === 2 || n === 3));
          if (reset)
            tx.objectStore(sampleStores[n]!).delete(
              IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
            );
          for (let i = reset ? 0 : start; i < counts[n]!; i++)
            tx.objectStore(sampleStores[n]!).put({
              sessionId: id,
              order: i,
              value: values[i],
            });
        }
        const row: LocalSession = {
          ...(activity.payload.endedAt
            ? {
                history: {
                  metrics: calculateMetrics(
                    activity.payload.startedAt,
                    activity.payload.endedAt,
                    activity.payload.intervals,
                    activity.payload.points,
                  ),
                },
              }
            : {}),
          id,
          version: 1,
          ownerId: activity.ownerId,
          bike: activity.bike,
          state,
          payload: meta,
          activeStart: activity.activeStart,
          recordedAt: now,
          counts,
          writer,
          leaseUntil: now + 15_000,
          decision: 'review',
        };
        store.put(row);
      },
    );
  }
  list(ownerId: string): Promise<LocalSession[]> {
    return this.db.transaction(['offline_sessions'], 'readonly', (tx) =>
      requestResult(
        tx.objectStore('offline_sessions').index('owner').getAll(ownerId),
      ),
    );
  }
  async read(ownerId: string, clientId: string) {
    const id = key(ownerId, clientId);
    return this.db.transaction(
      ['offline_sessions', ...sampleStores],
      'readonly',
      async (tx) => {
        const row = await requestResult<LocalSession | undefined>(
          tx.objectStore('offline_sessions').get(id),
        );
        if (!row || row.ownerId !== ownerId)
          throw new Error('Atividade local não encontrada nesta conta.');
        if (row.version !== 1)
          throw new Error('Atualize o aplicativo para ler esta atividade.');
        const arrays = await Promise.all(
          sampleStores.map((s) =>
            requestResult<{ value: unknown }[]>(
              tx.objectStore(s).index('session').getAll(id),
            ),
          ),
        );
        if (arrays.some((a, n) => a.length !== row.counts[n]))
          throw new Error(
            'Dados locais incompletos. Preserve esta atividade e tente recuperar novamente.',
          );
        const payload = row.payload;
        payload.points = arrays[0]!.map(
          (r) => r.value,
        ) as RidePayload['points'];
        if (payload.motion)
          payload.motion.samples = arrays[1]!.map(
            (r) => r.value,
          ) as NonNullable<RidePayload['motion']>['samples'];
        if (payload.speedProcessing)
          payload.speedProcessing.samples = arrays[2]!.map(
            (r) => r.value,
          ) as NonNullable<RidePayload['speedProcessing']>['samples'];
        if (payload.telemetry)
          payload.telemetry.events = arrays[3]!.map(
            (r) => r.value,
          ) as NonNullable<RidePayload['telemetry']>['events'];
        return {
          row,
          activity: {
            ownerId,
            bike: row.bike,
            payload,
            activeStart: row.activeStart,
          } satisfies Activity,
        };
      },
    );
  }
  async enqueue(ownerId: string, clientId: string) {
    const id = key(ownerId, clientId);
    await this.db.transaction(
      ['offline_sessions', 'sync_queue'],
      'readwrite',
      async (tx) => {
        const row = await requestResult<LocalSession | undefined>(
          tx.objectStore('offline_sessions').get(id),
        );
        if (!row?.payload.endedAt || row.ownerId !== ownerId)
          throw new Error('Finalize a atividade antes de salvar.');
        const existing = await requestResult(
          tx.objectStore('sync_queue').get(id),
        );
        if (existing) return;
        tx.objectStore('offline_sessions').put({
          ...row,
          decision: 'save',
          leaseUntil: 0,
        });
        tx.objectStore('sync_queue').put({
          id,
          ownerId,
          state: 'pending',
          attempts: 0,
          lastAttempt: null,
          nextAttempt: 0,
          error: null,
          received: [],
          serverId: null,
        } satisfies QueueItem);
      },
    );
  }
  queue(ownerId: string): Promise<QueueItem[]> {
    return this.db.transaction(['sync_queue'], 'readonly', (tx) =>
      requestResult(
        tx.objectStore('sync_queue').index('owner').getAll(ownerId),
      ),
    );
  }
  async update(
    item: QueueItem,
    confirmation?: SaveConfirmation,
    guard?: { id: string; holder: string },
  ) {
    await this.db.transaction(
      ['sync_queue', 'offline_sessions', 'sync_metadata'],
      'readwrite',
      async (tx) => {
        if (guard) {
          const lock = await requestResult<
            { holder: string; until: number } | undefined
          >(tx.objectStore('sync_metadata').get(guard.id));
          if (!lock || lock.holder !== guard.holder || lock.until <= Date.now())
            throw new Error(
              'Bloqueio de sincronização expirou. Tente novamente.',
            );
        }
        const old = await requestResult<QueueItem | undefined>(
          tx.objectStore('sync_queue').get(item.id),
        );
        if (!old || old.ownerId !== item.ownerId)
          throw new Error('Fila local indisponível.');
        tx.objectStore('sync_queue').put(item);
        if (confirmation) {
          const row = await requestResult<LocalSession>(
            tx.objectStore('offline_sessions').get(item.id),
          );
          tx.objectStore('offline_sessions').put({ ...row, confirmation });
        }
      },
    );
  }
  async remove(ownerId: string, clientId: string, confirmedOnly = false) {
    const id = key(ownerId, clientId);
    await this.db.transaction(
      ['offline_sessions', 'sync_queue', ...sampleStores],
      'readwrite',
      async (tx) => {
        const row = await requestResult<LocalSession | undefined>(
          tx.objectStore('offline_sessions').get(id),
        );
        if (!row) return;
        if (row.ownerId !== ownerId)
          throw new Error('Atividade não encontrada nesta conta.');
        if (confirmedOnly ? !row.confirmation : row.decision === 'save')
          throw new Error('Atividades pendentes não podem ser removidas.');
        tx.objectStore('offline_sessions').delete(id);
        tx.objectStore('sync_queue').delete(id);
        for (const name of sampleStores)
          tx.objectStore(name).delete(
            IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
          );
      },
    );
  }
  async lease(id: string, holder: string, now: number, duration = 60_000) {
    return this.db.transaction(['sync_metadata'], 'readwrite', async (tx) => {
      const store = tx.objectStore('sync_metadata');
      const old = await requestResult<
        { holder: string; until: number } | undefined
      >(store.get(id));
      if (old && old.holder !== holder && old.until > now) return false;
      store.put({ id, holder, until: now + duration });
      return true;
    });
  }
  async cancelSaved(
    ownerId: string,
    clientId: string,
    holder: string,
    serverDeleted: boolean,
  ) {
    const id = key(ownerId, clientId);
    await this.db.transaction(
      ['offline_sessions', 'sync_queue', 'sync_metadata', ...sampleStores],
      'readwrite',
      async (tx) => {
        const lock = await requestResult<
          { holder: string; until: number } | undefined
        >(tx.objectStore('sync_metadata').get(`sync:${ownerId}`));
        if (!lock || lock.holder !== holder || lock.until <= Date.now())
          throw new Error('Aguarde a sincronização atual antes de descartar.');
        const row = await requestResult<LocalSession | undefined>(
          tx.objectStore('offline_sessions').get(id),
        );
        if (!row || row.ownerId !== ownerId)
          throw new Error('Atividade não encontrada nesta conta.');
        const queued = await requestResult<QueueItem | undefined>(
          tx.objectStore('sync_queue').get(id),
        );
        if (!row.payload.endedAt)
          throw new Error('Finalize a sessão antes de descartar.');
        if (
          !serverDeleted &&
          (row.confirmation ||
            (queued?.lastAttempt !== null && queued?.lastAttempt !== undefined))
        )
          throw new Error(
            'Reconecte para confirmar a exclusão de uma atividade que já teve tentativa de envio.',
          );
        tx.objectStore('sync_metadata').put({
          id: `deleted:${id}`,
          at: Date.now(),
        });
        tx.objectStore('offline_sessions').delete(id);
        tx.objectStore('sync_queue').delete(id);
        for (const name of sampleStores)
          tx.objectStore(name).delete(
            IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
          );
      },
    );
  }
  async release(id: string, holder: string) {
    await this.db.transaction(['sync_metadata'], 'readwrite', async (tx) => {
      const store = tx.objectStore('sync_metadata');
      if (
        (await requestResult<{ holder: string } | undefined>(store.get(id)))
          ?.holder === holder
      )
        store.delete(id);
    });
  }
}
export const offlineRepository = new OfflineSessionRepository();
export function localConfirmation(
  payload: RidePayload,
  metrics: RideMetrics,
): SaveConfirmation {
  return { status: 'ok', id: payload.clientId, metrics, local: true };
}
