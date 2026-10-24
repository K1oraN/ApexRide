import type { RideController } from '../ride/controller';
import { CameraService, cameraError } from './camera';
import { VideoRecorderService } from './recorder';
import { videoRepository, type VideoStorageRepository } from './repository';
import { videoStorageStatus } from './storage-monitor';
import { videoAnchor } from './timing';
import {
  defaultVideoSettings,
  presets,
  type VideoAnchor,
  type VideoChunk,
  type VideoSegment,
  type VideoSettings,
  type VideoState,
} from './types';

export class RideVideoIntegration {
  private ownerId: string | null = null;
  private generation = 0;
  private writer = crypto.randomUUID();
  private serial = Promise.resolve();
  private lastRideKey = '';
  private listeners = new Set<() => void>();
  private recorder: VideoRecorderService | null = null;
  private segment: VideoSegment | null = null;
  private endAnchor: VideoAnchor | null = null;
  private storageFailure = false;
  private trackOff: (() => void) | null = null;
  private unconfirmed = new Map<
    string,
    {
      segment: VideoSegment;
      chunks: VideoChunk[];
      end: VideoAnchor | null;
      captureComplete: boolean;
    }
  >();
  private snapshot = {
    state: 'disabled' as VideoState,
    enabled: false,
    settings: { ...defaultVideoSettings },
    applied: null as MediaTrackSettings | null,
    devices: [] as MediaDeviceInfo[],
    stream: null as MediaStream | null,
    error: '',
    storage: '',
    bytes: 0,
    estimatedMs: 0,
    segments: [] as VideoSegment[],
    busy: false,
    pendingBytes: 0,
  };
  constructor(
    readonly controller: RideController,
    readonly repo: VideoStorageRepository = videoRepository,
    readonly camera = new CameraService(),
  ) {
    controller.video = {
      settle: this.settle,
      discard: async (owner, clientId) => {
        const activity = this.controller.getSnapshot().activity;
        if (
          (activity?.ownerId === owner &&
            activity.payload.clientId === clientId) ||
          (this.segment?.ownerId === owner &&
            this.segment.clientId === clientId)
        )
          await this.settle();
        await repo.remove(owner, clientId);
        for (const [id, draft] of this.unconfirmed)
          if (
            draft.segment.ownerId === owner &&
            draft.segment.clientId === clientId
          )
            this.unconfirmed.delete(id);
        this.pendingChanged();
      },
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(patch: Partial<typeof this.snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((f) => f());
  }
  private pendingChanged() {
    this.publish({
      pendingBytes: [...this.unconfirmed.values()]
        .filter((d) => d.segment.ownerId === this.ownerId)
        .reduce(
          (n, d) => n + d.chunks.reduce((bytes, c) => bytes + c.blob.size, 0),
          0,
        ),
    });
  }
  retryPending = () =>
    this.enqueue(async () => {
      const owner = this.ownerId;
      if (!owner) return;
      for (const [id, draft] of this.unconfirmed) {
        if (draft.segment.ownerId !== owner) continue;
        this.publish({ busy: true, state: 'persisting' });
        await this.repo.reopen(owner, id, this.writer);
        try {
          while (draft.chunks.length) {
            const chunk = draft.chunks[0]!;
            await this.repo.append(owner, id, this.writer, chunk);
            draft.chunks.shift();
            if (this.ownerId === owner)
              this.publish({ bytes: this.snapshot.bytes + chunk.blob.size });
            this.pendingChanged();
          }
          await this.repo.finish(
            owner,
            id,
            this.writer,
            draft.end,
            draft.captureComplete,
            'Dados confirmados após retentativa local',
            draft.segment.mimeType,
          );
          this.unconfirmed.delete(id);
          if (this.ownerId === owner)
            this.publish({
              state: draft.captureComplete ? 'finished' : 'interrupted',
              busy: false,
              error: draft.captureComplete
                ? ''
                : 'Dados persistidos; captura incompleta.',
              segments: await this.repo.list(owner, draft.segment.clientId),
            });
        } catch (error) {
          await this.repo.finish(
            owner,
            id,
            this.writer,
            draft.end,
            false,
            'Persistência ainda não confirmada',
            draft.segment.mimeType,
          );
          throw error;
        }
      }
      this.pendingChanged();
    });
  discardPending = () => {
    for (const [id, draft] of this.unconfirmed)
      if (draft.segment.ownerId === this.ownerId) this.unconfirmed.delete(id);
    this.pendingChanged();
  };
  private enqueue(work: () => Promise<void>) {
    const next = this.serial.then(work).catch(this.fail);
    this.serial = next;
    return next;
  }
  private fail = (error: unknown) => {
    this.camera.close();
    this.trackOff?.();
    this.trackOff = null;
    this.publish({
      state:
        (error as Error)?.name === 'QuotaExceededError'
          ? 'storage-full'
          : 'error',
      error: cameraError(error),
      stream: null,
      busy: false,
    });
  };
  owner(owner: string | null) {
    if (this.ownerId === owner) return;
    this.generation++;
    this.ownerId = owner;
    this.camera.close();
    if (this.recorder) this.interrupt('Conta encerrada ou alterada.');
    this.publish({
      enabled: false,
      state: 'disabled',
      settings: { ...defaultVideoSettings },
      stream: null,
      applied: null,
      devices: [],
      error: '',
      segments: [],
      bytes: 0,
      estimatedMs: 0,
    });
    this.pendingChanged();
    if (owner)
      void this.repo.recover(owner, Date.now(), true).catch((e) => {
        if (this.ownerId === owner) this.fail(e);
      });
  }
  settings(settings: VideoSettings) {
    if (this.snapshot.busy || this.controller.getSnapshot().state === 'running')
      return;
    this.camera.close();
    this.publish({
      settings,
      stream: null,
      state: 'disabled',
      enabled: false,
      applied: null,
      error: '',
    });
  }
  prepare = async () => {
    if (
      !this.ownerId ||
      this.snapshot.busy ||
      this.controller.getSnapshot().state === 'running'
    )
      return;
    const generation = ++this.generation;
    this.publish({
      enabled: true,
      busy: true,
      state: this.snapshot.stream ? 'switching' : 'permission',
      error: '',
    });
    try {
      await this.settle();
      if (generation !== this.generation) return;
      this.publish({ state: 'camera', busy: true });
      const result = await this.camera.open(this.snapshot.settings);
      if (generation !== this.generation) {
        this.camera.close();
        return;
      }
      const storage = await videoStorageStatus(result.quality);
      if (generation !== this.generation) return;
      const warning =
        result.quality !== this.snapshot.settings.quality
          ? 'Qualidade reduzida para compatibilidade. '
          : '';
      const mismatch =
        result.applied.facingMode &&
        result.applied.facingMode !== this.snapshot.settings.facing
          ? 'O navegador forneceu uma câmera diferente da solicitada. Confira a prévia. '
          : '';
      this.trackOff?.();
      const interrupted = () =>
        this.interrupt(
          'A câmera foi encerrada ou suspensa. Retome apenas com a moto parada.',
        );
      for (const track of result.stream.getTracks()) {
        track.addEventListener('ended', interrupted);
        track.addEventListener('mute', interrupted);
      }
      this.trackOff = () => {
        for (const track of result.stream.getTracks()) {
          track.removeEventListener('ended', interrupted);
          track.removeEventListener('mute', interrupted);
        }
      };
      this.publish({
        busy: false,
        state: 'preview',
        settings: { ...this.snapshot.settings, quality: result.quality },
        stream: result.stream,
        applied: result.applied,
        devices: result.devices,
        error: warning + mismatch,
        storage: storage.message,
      });
      if (storage.low)
        this.publish({
          state: 'storage-full',
          error:
            'Espaço insuficiente para iniciar vídeo com margem. Libere espaço ou continue sem vídeo.',
        });
      else if (this.controller.getSnapshot().state === 'running')
        await this.enqueue(this.begin);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  };
  disable = () => {
    this.generation++;
    this.publish({ enabled: false, busy: false });
    const stop = this.requestStop('Gravação encerrada pelo usuário');
    this.camera.close();
    this.trackOff?.();
    this.trackOff = null;
    this.publish({ stream: null });
    return this.enqueue(async () => {
      await stop;
      await this.end();
      this.publish({ state: 'disabled' });
    });
  };
  private requestStop(
    reason: string,
    snapshot = this.controller.getSnapshot(),
  ) {
    if (!this.recorder) return Promise.resolve(null);
    if (!this.endAnchor) {
      try {
        this.endAnchor = videoAnchor(snapshot);
      } catch {
        this.endAnchor = null;
      }
    }
    this.publish({ state: 'stopping', busy: true });
    return this.recorder.stop(reason);
  }
  private begin = async () => {
    const ride = this.controller.getSnapshot(),
      owner = this.ownerId,
      stream = this.camera.stream;
    if (
      !this.snapshot.enabled ||
      this.snapshot.busy ||
      this.recorder ||
      ride.state !== 'running' ||
      !ride.activity ||
      ride.activity.ownerId !== owner ||
      !stream ||
      this.snapshot.state === 'storage-full'
    )
      return;
    if (
      [...this.unconfirmed.values()].some((d) => d.segment.ownerId === owner)
    ) {
      this.publish({
        state: 'error',
        error:
          'Há blocos de vídeo não persistidos. Tente salvar novamente ou descarte esses blocos explicitamente antes de gravar mais.',
      });
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      this.fail(
        new Error(
          'Este navegador não oferece gravação de vídeo. O GPS continua funcionando.',
        ),
      );
      return;
    }
    this.publish({ state: 'preparing', busy: true, error: '' });
    const storage = await videoStorageStatus(this.snapshot.settings.quality);
    if (storage.low) {
      this.publish({
        state: 'storage-full',
        busy: false,
        storage: storage.message,
      });
      return;
    }
    if (
      this.controller.getSnapshot().state !== 'running' ||
      !this.snapshot.enabled ||
      owner !== this.ownerId
    ) {
      this.publish({ busy: false });
      return;
    }
    const segment: VideoSegment = {
      id: crypto.randomUUID(),
      version: 1,
      ownerId: owner!,
      clientId: ride.activity.payload.clientId,
      order: 0,
      writer: this.writer,
      leaseUntil: Date.now() + 30_000,
      state: 'writing',
      requested: { ...this.snapshot.settings },
      applied: this.snapshot.applied ?? {},
      audio: stream.getAudioTracks().length > 0,
      mimeType: '',
      start: null,
      end: null,
      createdAt: Date.now(),
      lastReceivedAt: null,
      chunks: 0,
      bytes: 0,
      reason: null,
      durationEstimatedMs: null,
      mediaDurationMs: null,
    };
    segment.order = await this.repo.create(segment);
    this.segment = segment;
    this.endAnchor = null;
    this.storageFailure = false;
    try {
      if (
        this.controller.getSnapshot().state !== 'running' ||
        !this.snapshot.enabled ||
        owner !== this.ownerId
      ) {
        await this.end();
        return;
      }
      this.recorder = new VideoRecorderService(
        stream,
        presets[segment.requested.quality].bitrate,
        {
          started: async (mimeType) => {
            const start = videoAnchor(this.controller.getSnapshot());
            segment.start = start;
            segment.mimeType = mimeType;
            await this.repo.start(
              segment.ownerId,
              segment.id,
              this.writer,
              start,
              mimeType,
            );
            if (
              this.controller.getSnapshot().state === 'running' &&
              !this.endAnchor
            )
              this.publish({ state: 'recording', busy: false });
          },
          chunk: async (blob, order, receivedAt) => {
            const chunk = { segmentId: segment.id, order, receivedAt, blob };
            const hold = () => {
              let draft = this.unconfirmed.get(segment.id);
              if (!draft) {
                draft = {
                  segment,
                  chunks: [],
                  end: null,
                  captureComplete: false,
                };
                this.unconfirmed.set(segment.id, draft);
              }
              draft.chunks.push(chunk);
              this.pendingChanged();
            };
            if (this.unconfirmed.has(segment.id)) {
              hold();
              throw new Error('Blocos anteriores aguardam persistência.');
            }
            // Retry once for transient transaction failures; quota is never retried blindly.
            try {
              await this.repo.append(
                segment.ownerId,
                segment.id,
                this.writer,
                chunk,
              );
            } catch (e) {
              if ((e as Error).name === 'QuotaExceededError') {
                hold();
                throw e;
              }
              try {
                await this.repo.append(
                  segment.ownerId,
                  segment.id,
                  this.writer,
                  chunk,
                );
              } catch (retryError) {
                hold();
                throw retryError;
              }
            }
            if (this.ownerId === segment.ownerId)
              this.publish({ bytes: this.snapshot.bytes + blob.size });
          },
          fault: (reason, error) => {
            this.requestStop(reason);
            this.storageFailure ||=
              (error as Error)?.name === 'QuotaExceededError';
            this.publish({
              error: this.storageFailure
                ? 'Armazenamento insuficiente. Libere espaço para tentar persistir os blocos pendentes.'
                : reason,
              state:
                (error as Error)?.name === 'QuotaExceededError'
                  ? 'storage-full'
                  : 'interrupted',
            });
          },
          ended: () => {
            if (this.segment === segment) void this.enqueue(this.end);
          },
        },
      );
      await this.recorder.start();
    } catch (error) {
      if (this.recorder) await this.recorder.stop('Falha no início');
      await this.end();
      this.fail(error);
    }
  };
  private end = async () => {
    const recorder = this.recorder,
      segment = this.segment;
    if (!segment) return;
    const result = recorder
      ? await recorder.stop()
      : {
          complete: false,
          captureComplete: false,
          reason: 'Falha ao preparar gravador',
          mimeType: '',
        };
    if (this.ownerId === segment.ownerId)
      this.publish({ state: 'persisting', busy: true });
    const end =
      this.endAnchor && segment.start
        ? {
            ...this.endAnchor,
            mediaEstimatedMs: Math.max(
              0,
              this.endAnchor.monotonicMs - segment.start.monotonicMs,
            ),
          }
        : this.endAnchor;
    const pending = this.unconfirmed.get(segment.id);
    if (pending) {
      pending.end = end;
      pending.captureComplete = result.captureComplete;
    }
    await this.repo.finish(
      segment.ownerId,
      segment.id,
      this.writer,
      end,
      result.complete,
      result.reason,
      result.mimeType,
    );
    this.recorder = null;
    this.segment = null;
    this.endAnchor = null;
    const currentOwner = this.ownerId === segment.ownerId;
    const ride = this.controller.getSnapshot();
    if (
      ride.activity?.payload.endedAt ||
      !this.snapshot.enabled ||
      !result.complete ||
      !currentOwner
    ) {
      this.trackOff?.();
      this.trackOff = null;
      this.camera.close();
    }
    if (currentOwner) {
      const rows = await this.repo.list(segment.ownerId, segment.clientId);
      const incomplete = rows.some((r) => r.state !== 'complete');
      const interrupted =
        ![
          'Finalização da atividade',
          'Finalização solicitada',
          'Gravação encerrada pelo usuário',
        ].includes(result.reason) && !result.reason.startsWith('Pausa do Ride');
      this.publish({
        busy: false,
        segments: rows,
        stream: this.camera.stream,
        estimatedMs: rows.reduce((n, s) => n + (s.durationEstimatedMs ?? 0), 0),
        state: this.storageFailure
          ? 'storage-full'
          : incomplete || interrupted
            ? 'interrupted'
            : ride.state === 'paused' || ride.state === 'waiting-gps'
              ? 'paused'
              : 'finished',
        error: incomplete
          ? `${this.storageFailure ? 'Armazenamento insuficiente. ' : ''}Vídeo com trechos incompletos. ${result.reason} O Ride foi preservado.`
          : this.snapshot.error,
      });
    } else this.publish({ busy: false });
  };
  settle = () => {
    const stop = this.requestStop('Finalização da atividade');
    return this.enqueue(async () => {
      await stop;
      await this.end();
    });
  };
  interrupt = (reason: string) => {
    this.generation++;
    this.requestStop(reason);
    this.camera.close();
    this.trackOff?.();
    this.trackOff = null;
    this.publish({
      state: 'interrupted',
      error: reason,
      stream: null,
      busy: false,
    });
    void this.enqueue(this.end);
  };
  private changed = () => {
    const ride = this.controller.getSnapshot();
    const key = `${ride.activity?.payload.clientId ?? ''}:${ride.state}`;
    if (key === this.lastRideKey) return;
    const previousKey = this.lastRideKey;
    this.lastRideKey = key;
    if (!ride.activity) {
      if (this.segment) void this.settle();
      if (
        ride.state === 'preparation' &&
        (previousKey.endsWith(':saved') || previousKey.endsWith(':discarded'))
      ) {
        this.camera.close();
        this.publish({
          state: 'disabled',
          enabled: false,
          stream: null,
          applied: null,
          segments: [],
          bytes: 0,
          estimatedMs: 0,
        });
      }
      return;
    }
    if (ride.activity.ownerId !== this.ownerId) return;
    if (ride.state === 'running') void this.enqueue(this.begin);
    else if (this.recorder) {
      this.requestStop(
        ride.state === 'paused' || ride.state === 'waiting-gps'
          ? 'Pausa do Ride; retomada em novo segmento'
          : 'Finalização da atividade',
        ride,
      );
      void this.enqueue(this.end);
    } else if (ride.activity.payload.endedAt) {
      this.camera.close();
      this.publish({ stream: null });
    }
  };
  monitor = async (persist = false) => {
    const result = await videoStorageStatus(
      this.snapshot.settings.quality,
      persist,
    );
    this.publish({ storage: result.message });
    if (result.low && this.recorder)
      this.interrupt(
        'Espaço próximo do limite; vídeo encerrado. GPS continua.',
      );
  };
  connect() {
    const off = this.controller.subscribe(this.changed);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (this.unconfirmed.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const inUse = () =>
      Boolean(
        this.camera.stream ||
        this.recorder ||
        (this.snapshot.enabled && this.snapshot.busy),
      );
    const hidden = () => {
      if (document.visibilityState === 'hidden' && inUse())
        this.interrupt(
          'Página em segundo plano; gravação interrompida. Retome explicitamente com a moto parada.',
        );
    };
    const hide = () => {
      if (inUse())
        this.interrupt(
          'Página encerrada; somente dados confirmados podem ser recuperados.',
        );
    };
    const timer = setInterval(() => {
      if (this.segment) {
        const s = this.segment;
        void this.repo
          .heartbeat(s.ownerId, s.id, this.writer)
          .catch((e) => this.interrupt(cameraError(e)));
      }
      if (this.snapshot.state === 'recording' && this.segment?.start)
        this.publish({
          estimatedMs:
            this.snapshot.segments.reduce(
              (n, s) => n + (s.durationEstimatedMs ?? 0),
              0,
            ) + Math.max(0, performance.now() - this.segment.start.monotonicMs),
        });
    }, 1000);
    const monitor = setInterval(() => {
      void this.monitor();
      if (this.ownerId) void this.repo.recover(this.ownerId).catch(this.fail);
    }, 15_000);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', hide);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      off();
      clearInterval(timer);
      clearInterval(monitor);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('beforeunload', beforeUnload);
      void this.disable();
    };
  }
}
