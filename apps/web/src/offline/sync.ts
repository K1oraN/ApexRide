import { ApiError, authRequest, getSession } from '../services/auth';
import { rideService, type SaveConfirmation } from '../services/rides';
import {
  OfflineSessionRepository,
  splitPayload,
  type QueueItem,
} from './repository';
import type { ConnectivityService } from './connectivity';
import type { RidePayload } from '@apex-ride/ride-core';

export function retryDelay(attempt: number, random = Math.random) {
  return Math.round(
    Math.min(15 * 60_000, 5000 * 2 ** Math.min(attempt - 1, 8)) *
      (0.8 + random() * 0.4),
  );
}
export function classifySyncError(error: unknown): QueueItem['state'] {
  return error instanceof ApiError
    ? [401, 403].includes(error.status)
      ? 'auth'
      : error.status >= 400 &&
          error.status < 500 &&
          ![408, 429].includes(error.status)
        ? 'permanent'
        : 'temporary'
    : 'temporary';
}
export async function uploadRide(
  payload: RidePayload,
  progress: (received: number[]) => Promise<void>,
  check: () => Promise<void>,
) {
  const { series, meta } = splitPayload(payload);
  // Conservative small-activity threshold; large recordings use bounded REST requests.
  if (series.reduce((n, a) => n + a.length, 0) <= 500) {
    await check();
    return rideService.save(payload);
  }
  const path = `/rides/sync/${encodeURIComponent(payload.clientId)}`;
  await check();
  const manifest = {
    version: 1,
    meta,
    counts: {
      points: series[0]!.length,
      motion: series[1]!.length,
      speed: series[2]!.length,
      events: series[3]!.length,
    },
  };
  const response = await authRequest<{ status: string; received: number[] }>(
    path,
    'POST',
    manifest,
  );
  if (response.status !== 'ok' || !Array.isArray(response.received))
    throw new Error('Resposta de envio inválida.');
  const received = new Set(response.received);
  const total = Math.ceil(Math.max(...series.map((a) => a.length)) / 500);
  await progress([...received]);
  for (let index = 0; index < total; index++) {
    if (received.has(index)) continue;
    await check();
    const values = series.map((a) => a.slice(index * 500, (index + 1) * 500));
    const batch = await authRequest<{ status: string; index: number }>(
      `${path}/batches/${index}`,
      'POST',
      {
        points: values[0],
        motion: values[1],
        speed: values[2],
        events: values[3],
      },
    );
    if (batch.status !== 'ok' || batch.index !== index)
      throw new Error('Lote sem confirmação válida.');
    received.add(index);
    await progress([...received]);
  }
  await check();
  return authRequest<SaveConfirmation>(`${path}/complete`, 'POST', {});
}
export class SyncService {
  private running = false;
  private holder = crypto.randomUUID();
  constructor(
    private readonly repo: OfflineSessionRepository,
    private readonly connectivity: ConnectivityService,
    private readonly owner: () => string | null,
    private readonly active: () => boolean,
    private readonly changed: () => void,
    private readonly upload = uploadRide,
    private readonly session = getSession,
  ) {}
  async run(manual = false) {
    const owner = this.owner();
    if (this.running || !owner || this.active()) return;
    this.running = true;
    const lock = `sync:${owner}`;
    let locked = false;
    try {
      const ready = (item: QueueItem) =>
        item.state !== 'confirmed' &&
        item.state !== 'permanent' &&
        (manual || item.nextAttempt <= Date.now());
      if (!(await this.repo.queue(owner)).some(ready)) return;
      if ((await this.connectivity.check(manual)) !== 'online') return;
      locked = await this.repo.lease(lock, this.holder, Date.now());
      if (!locked) return;
      const ensureOwner = async () => {
        if (this.owner() !== owner)
          throw new ApiError(
            401,
            'Conta alterada. Entre na conta proprietária.',
          );
        const authenticated = await this.session();
        if (authenticated.user.id !== owner)
          throw new ApiError(
            401,
            'Entre na conta proprietária para sincronizar.',
          );
        if (!(await this.repo.lease(lock, this.holder, Date.now())))
          throw new Error('Sincronização assumida por outra aba.');
      };
      for (let item of await this.repo.queue(owner)) {
        if (this.active() || this.owner() !== owner) break;
        if (!ready(item)) continue;
        item = {
          ...item,
          attempts: item.attempts + 1,
          lastAttempt: Date.now(),
          state: 'sending',
          error: null,
        };
        await this.repo.update(item, undefined, {
          id: lock,
          holder: this.holder,
        });
        this.changed();
        try {
          await ensureOwner();
          const { activity } = await this.repo.read(
            owner,
            item.id.slice(owner.length + 1),
          );
          const response = await this.upload(
            activity.payload,
            async (received) => {
              item = { ...item, state: 'partial', received };
              await this.repo.update(item, undefined, {
                id: lock,
                holder: this.holder,
              });
              this.changed();
            },
            ensureOwner,
          );
          if (
            response.status !== 'ok' ||
            !response.id ||
            !response.metrics ||
            response.local
          )
            throw new Error('Servidor não confirmou o salvamento.');
          if (this.owner() !== owner)
            throw new ApiError(
              401,
              'Conta alterada após o envio. Confirme novamente na conta original.',
            );
          await this.repo.update(
            {
              ...item,
              state: 'confirmed',
              serverId: response.id,
              nextAttempt: 0,
            },
            response,
            { id: lock, holder: this.holder },
          );
        } catch (error) {
          const state = classifySyncError(error);
          await this.repo.update(
            {
              ...item,
              state,
              error: error instanceof Error ? error.message : 'Falha no envio.',
              nextAttempt:
                state === 'temporary'
                  ? Date.now() + retryDelay(item.attempts)
                  : Number.MAX_SAFE_INTEGER,
            },
            undefined,
            { id: lock, holder: this.holder },
          );
          if (state === 'auth') break;
          if (state === 'temporary') {
            void this.connectivity.check(true);
            break;
          }
        } finally {
          this.changed();
        }
      }
    } finally {
      try {
        if (locked) await this.repo.release(lock, this.holder);
      } finally {
        this.running = false;
      }
    }
  }
}
