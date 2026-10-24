import { calculateMetrics } from '@apex-ride/ride-core';
import type { Activity, RideController } from '../ride/controller';
import { ConnectivityService } from './connectivity';
import {
  localConfirmation,
  offlineRepository,
  type LocalSession,
  type QueueItem,
} from './repository';
import { storageError, storageStatus } from './storage';
import { SyncService } from './sync';
import { authRequest } from '../services/auth';
import { VideoStorageRepository } from '../video/repository';

export const OFFLINE_FLUSH_MS = 2000;
export class OfflineCoordinator {
  readonly connectivity = new ConnectivityService();
  private writer = crypto.randomUUID();
  private ownerId: string | null = null;
  private serial: Promise<void> = Promise.resolve();
  private dirty = false;
  private lastState = '';
  private writing = false;
  private discarding = false;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private state = {
    sessions: [] as LocalSession[],
    queue: [] as QueueItem[],
    error: null as string | null,
    local: 'Aguardando gravação local',
    storage: null as string | null,
  };
  readonly sync: SyncService;
  private readonly videos: VideoStorageRepository;
  constructor(
    readonly controller: RideController,
    readonly repo = offlineRepository,
  ) {
    this.videos = new VideoStorageRepository(repo.db);
    this.sync = new SyncService(
      repo,
      this.connectivity,
      () => this.ownerId,
      () =>
        ['running', 'paused', 'waiting-gps'].includes(
          controller.getSnapshot().state,
        ),
      () => {
        void this.refresh();
        this.channel?.postMessage('changed');
      },
    );
    controller.offline = {
      changed: this.changed,
      save: this.save,
      discard: this.discard,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  private fail = (error: unknown) => {
    this.publish({
      error: storageError(error),
      local: 'Gravação local não confirmada',
    });
  };
  owner(ownerId: string | null) {
    if (this.ownerId === ownerId) return;
    this.ownerId = ownerId;
    this.publish({ sessions: [], queue: [], error: null });
    void this.refresh();
    void this.sync.run(true).catch(this.fail);
  }
  refresh = async () => {
    const owner = this.ownerId;
    if (!owner) return;
    try {
      const [sessions, queue] = await Promise.all([
        this.repo.list(owner),
        this.repo.queue(owner),
      ]);
      if (this.ownerId === owner) this.publish({ sessions, queue });
      for (const row of sessions)
        if (row.confirmation && this.ownerId === owner)
          await this.videos.link(
            owner,
            row.payload.clientId,
            row.confirmation.id,
          );
      const current = this.controller.getSnapshot().activity;
      const confirmed =
        current?.ownerId === owner
          ? sessions.find(
              (row) => row.payload.clientId === current.payload.clientId,
            )?.confirmation
          : null;
      if (confirmed && this.ownerId === owner)
        this.controller.confirmSaved(confirmed.id);
    } catch (error) {
      if (this.ownerId === owner) this.fail(error);
    }
  };
  private changed = () => {
    if (this.discarding) return;
    const { state, activity } = this.controller.getSnapshot();
    if (!activity || ['saved', 'saving', 'discarded'].includes(state)) return;
    this.dirty = true;
    const transition = state !== this.lastState;
    this.lastState = state;
    if (transition && !this.writing) void this.flush().catch(this.fail);
  };
  private currentActivity(): Activity | null {
    const { activity } = this.controller.getSnapshot();
    if (!activity) return null;
    if (activity.payload.endedAt) return activity;
    const motion = this.controller.motion.checkpoint();
    const speedProcessing = this.controller.speed.checkpoint();
    const telemetry = this.controller.telemetry.checkpoint();
    return {
      ...activity,
      payload: {
        ...activity.payload,
        ...(motion ? { motion } : {}),
        ...(speedProcessing ? { speedProcessing } : {}),
        ...(telemetry ? { telemetry } : {}),
      },
    };
  }
  flush = () => {
    const operation = async () => {
      if (this.discarding) return;
      const activity = this.currentActivity();
      if (!activity || !this.dirty) return;
      this.dirty = false;
      this.writing = true;
      this.publish({ local: 'Salvando localmente' });
      try {
        await this.repo.checkpoint(
          activity,
          this.controller.getSnapshot().state === 'saving'
            ? 'finished'
            : this.controller.getSnapshot().state,
          this.writer,
          Date.now(),
        );
        this.publish({ local: 'Salvo no aparelho', error: null });
      } catch (error) {
        this.dirty = true;
        this.fail(error);
        throw error;
      } finally {
        this.writing = false;
      }
    };
    const next = this.serial.then(operation);
    this.serial = next.catch(() => {});
    return next;
  };
  private save = async (activity: Activity) => {
    this.dirty = true;
    await this.flush();
    await this.repo.enqueue(activity.ownerId, activity.payload.clientId);
    await this.refresh();
    this.channel?.postMessage('changed');
    // Let the controller commit its local saved state before the background upload starts.
    setTimeout(() => {
      void this.sync.run(true).catch(this.fail);
    }, 0);
    return localConfirmation(
      activity.payload,
      calculateMetrics(
        activity.payload.startedAt,
        activity.payload.endedAt,
        activity.payload.intervals,
        activity.payload.points,
      ),
    );
  };
  private discard = async (activity: Activity) => {
    this.discarding = true;
    try {
      await this.serial;
      await this.repo.remove(activity.ownerId, activity.payload.clientId);
      this.dirty = false;
      await this.refresh();
      this.channel?.postMessage('changed');
    } finally {
      this.discarding = false;
    }
  };
  recover = async (clientId: string) => {
    const owner = this.ownerId;
    if (!owner) return;
    try {
      const { activity, row } = await this.repo.read(owner, clientId);
      if (this.ownerId !== owner) return;
      if (
        row.leaseUntil > Date.now() &&
        row.writer !== this.writer &&
        row.decision === 'review'
      )
        throw new Error(
          'Esta sessão pode estar ativa em outra aba. Feche-a e aguarde 15 segundos.',
        );
      this.controller.recover(
        activity,
        row.recordedAt,
        row.confirmation,
        row.decision === 'save',
      );
    } catch (error) {
      this.fail(error);
    }
  };
  cleanup = async (clientId: string) => {
    if (!this.ownerId) return;
    try {
      await this.repo.remove(this.ownerId, clientId, true);
      await this.refresh();
      this.channel?.postMessage('changed');
    } catch (error) {
      this.fail(error);
    }
  };
  cancelHistory = async (clientId: string) => {
    const owner = this.ownerId;
    if (!owner) throw new Error('Entre na conta proprietária.');
    if (
      this.controller.getSnapshot().activity?.payload.clientId === clientId &&
      !['saved', 'finished', 'error'].includes(
        this.controller.getSnapshot().state,
      )
    )
      throw new Error('Finalize a sessão atual antes de descartá-la.');
    const holder = `delete:${crypto.randomUUID()}`,
      lock = `sync:${owner}`;
    if (!(await this.repo.lease(lock, holder, Date.now())))
      throw new Error('Aguarde a sincronização atual e tente novamente.');
    try {
      await this.serial;
      const { row } = await this.repo.read(owner, clientId);
      const item = (await this.repo.queue(owner)).find((q) => q.id === row.id);
      const needsServer = Boolean(
        row.confirmation ||
        (item?.lastAttempt !== null && item?.lastAttempt !== undefined),
      );
      if (needsServer) {
        if (!navigator.onLine)
          throw new Error('Reconecte para confirmar a exclusão no servidor.');
        await authRequest(`/rides/by-client/${clientId}`, 'DELETE');
      }
      if (this.ownerId !== owner) throw new Error('Conta alterada.');
      if (this.controller.video)
        await this.controller.video.discard(owner, clientId);
      else await this.videos.remove(owner, clientId);
      await this.repo.cancelSaved(owner, clientId, holder, needsServer);
      const snapshot = this.controller.getSnapshot();
      if (snapshot.activity?.payload.clientId === clientId) {
        if (snapshot.state === 'saved') this.controller.reset();
        else {
          this.discarding = true;
          try {
            await this.controller.discard();
          } finally {
            this.discarding = false;
          }
        }
      }
      await this.refresh();
      this.channel?.postMessage('changed');
    } finally {
      await this.repo.release(lock, holder);
    }
  };
  monitor = async (persist = false) => {
    const result = await storageStatus(persist);
    this.publish({ storage: result.warning });
  };
  connect() {
    const offConnectivity = this.connectivity.connect();
    const retry = () => {
      void this.sync.run().catch(this.fail);
    };
    const off = this.connectivity.subscribe(() => {
      if (this.connectivity.getSnapshot() === 'online') retry();
    });
    const checkpoint = () => {
      void this.flush().catch(this.fail);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') {
        void this.refresh();
        retry();
      } else checkpoint();
    };
    const timer = setInterval(checkpoint, OFFLINE_FLUSH_MS);
    const retryTimer = setInterval(() => {
      if (document.visibilityState === 'visible') retry();
    }, 15_000);
    const monitorTimer = setInterval(() => {
      void this.monitor();
    }, 60_000);
    window.addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', visible);
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('apex-offline');
      this.channel.onmessage = () => {
        void this.refresh();
      };
    }
    void this.monitor();
    return () => {
      checkpoint();
      off();
      offConnectivity();
      clearInterval(timer);
      clearInterval(retryTimer);
      clearInterval(monitorTimer);
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', visible);
      this.channel?.close();
      this.channel = null;
    };
  }
}
