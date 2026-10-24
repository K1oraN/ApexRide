import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { RideController } from '../ride/controller';
import { offlineActivity } from '../offline/fixtures';
import { LocalDatabase } from '../offline/database';
import { CameraService } from './camera';
import { RideVideoIntegration } from './coordinator';
import { VideoStorageRepository } from './repository';
import { FakeRecorder, testStream } from './fixtures';
import { videoAnchor } from './timing';
let db: LocalDatabase,
  repo: VideoStorageRepository,
  controller: RideController,
  video: RideVideoIntegration,
  off: () => void;
const preview = () => testStream().stream;
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  const factory = new IDBFactory();
  db = new LocalDatabase('integration', () => factory);
  repo = new VideoStorageRepository(db);
  controller = new RideController();
  const camera = new CameraService(
    () =>
      ({
        getUserMedia: vi.fn(async () => preview()),
      }) as unknown as MediaDevices,
    () => true,
  );
  video = new RideVideoIntegration(controller, repo, camera);
  video.owner('alice');
  off = video.connect();
});
afterEach(async () => {
  await video.disable();
  off();
  await video.settle();
  await db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeRecorder.instances = [];
});
function run(mode: 'passeio' | 'misto' | 'pista' = 'passeio') {
  const activity = offlineActivity();
  activity.payload.endedAt = 0;
  activity.payload.mode = mode;
  activity.activeStart = Date.now() - 1000;
  // Use the real controller's publish path to exercise subscriptions and session lifecycle.
  (controller as unknown as { publish: (s: object) => void }).publish({
    activity,
    state: 'running',
  });
  return activity;
}
const waitRecording = () =>
  vi.waitFor(() => expect(video.getSnapshot().state).toBe('recording'));
describe('16D integração e referências temporais', () => {
  it('excluir vídeo de outra atividade não interrompe a captura atual', async () => {
    await video.prepare();
    run();
    await waitRecording();
    await controller.video!.discard('alice', 'another-ride');
    expect(video.getSnapshot().state).toBe('recording');
    expect(FakeRecorder.instances.at(-1)!.state).toBe('recording');
  });
  it('ativar GPS e cancelar sua espera preservam a prévia explicitamente aberta', async () => {
    await video.prepare();
    const stream = video.camera.stream;
    const publish = (state: string) =>
      (controller as unknown as { publish: (s: object) => void }).publish({
        state,
      });
    publish('preparation');
    publish('waiting-gps');
    publish('preparation');
    expect(video.getSnapshot().state).toBe('preview');
    expect(video.camera.stream).toBe(stream);
  });
  it('quota preserva blocos não confirmados em memória e retentativa explícita conclui sem duplicar', async () => {
    await video.prepare();
    const a = run();
    await waitRecording();
    const append = vi
      .spyOn(repo, 'append')
      .mockRejectedValueOnce(new DOMException('Quota', 'QuotaExceededError'));
    FakeRecorder.instances.at(-1)!.data('unconfirmed');
    await vi.waitFor(() =>
      expect(video.getSnapshot().pendingBytes).toBeGreaterThan(0),
    );
    await video.settle();
    expect(controller.getSnapshot().state).toBe('running');
    expect((await repo.list('alice', a.payload.clientId))[0]!.state).toBe(
      'incomplete',
    );
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    append.mockRestore();
    await video.retryPending();
    expect(video.getSnapshot().pendingBytes).toBe(0);
    expect((await repo.list('alice', a.payload.clientId))[0]).toMatchObject({
      state: 'complete',
      chunks: 2,
      bytes: 16,
    });
  });
  it('descarte explícito de blocos pendentes preserva segmentos já persistidos', async () => {
    await video.prepare();
    run();
    await waitRecording();
    FakeRecorder.instances.at(-1)!.data('confirmed');
    await vi.waitFor(() => expect(video.getSnapshot().bytes).toBe(9));
    vi.spyOn(repo, 'append').mockRejectedValue(
      new DOMException('Quota', 'QuotaExceededError'),
    );
    FakeRecorder.instances.at(-1)!.data('unconfirmed');
    await vi.waitFor(() =>
      expect(video.getSnapshot().pendingBytes).toBeGreaterThan(0),
    );
    await video.settle();
    video.discardPending();
    expect(video.getSnapshot().pendingBytes).toBe(0);
    expect((await repo.list('alice'))[0]).toMatchObject({
      state: 'incomplete',
      chunks: 1,
      bytes: 9,
    });
  });
  it('sem MediaRecorder mantém câmera opcional e Ride em andamento', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    await video.prepare();
    run();
    await vi.waitFor(() => expect(video.getSnapshot().state).toBe('error'));
    expect(controller.getSnapshot().state).toBe('running');
    expect(video.camera.stream).toBeNull();
  });
  it('salvamento de telemetria espera a barreira de finalização do vídeo', async () => {
    run();
    controller.finish();
    let release!: () => void;
    controller.video!.settle = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const save = vi.fn(async () => ({
      status: 'ok' as const,
      id: 'remote',
      metrics: {
        activeMs: 1,
        pausedMs: 0,
        elapsedMs: 1,
        distanceMeters: 0,
        averageKmh: null,
        maximumKmh: null,
      },
    }));
    controller.offline = { changed: () => {}, discard: async () => {}, save };
    const operation = controller.save('alice');
    expect(save).not.toHaveBeenCalled();
    release();
    await operation;
    expect(save).toHaveBeenCalledOnce();
  });
  it('Ride sem vídeo e visibilidade oculta não ativam câmera nem REC', async () => {
    run();
    document.dispatchEvent(new Event('visibilitychange'));
    await video.settle();
    expect(FakeRecorder.instances).toHaveLength(0);
    expect(video.getSnapshot().state).toBe('disabled');
    expect(controller.getSnapshot().state).toBe('running');
  });
  it.each(['passeio', 'pista', 'misto'] as const)(
    '%s grava, persiste último chunk e encerra tracks sem inserir mídia no payload',
    async (mode) => {
      await video.prepare();
      expect(FakeRecorder.instances).toHaveLength(0);
      const track = video.camera.stream!.getVideoTracks()[0]!;
      const a = run(mode);
      await waitRecording();
      FakeRecorder.instances.at(-1)!.data('first');
      controller.finish();
      await video.settle();
      const rows = await repo.list('alice', a.payload.clientId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        state: 'complete',
        chunks: 2,
        bytes: 10,
      });
      expect(rows[0]!.start!.rideElapsedMs).toBeGreaterThan(1000);
      expect(rows[0]!.end!.rideActiveMs).toBeLessThanOrEqual(
        rows[0]!.end!.rideElapsedMs,
      );
      expect(track.stop).toHaveBeenCalled();
      expect(controller.getSnapshot().state).toBe('finished');
      expect(
        JSON.stringify(controller.getSnapshot().activity!.payload),
      ).not.toContain('video');
    },
  );
  it('pausa finaliza segmento, retomada mantém pausa fora da mídia e troca de câmera preserva anterior', async () => {
    await video.prepare();
    const a = run();
    await waitRecording();
    controller.pause();
    await vi.waitFor(() => expect(video.getSnapshot().state).toBe('paused'));
    expect((await repo.list('alice'))[0]!.state).toBe('complete');
    video.settings({ ...video.getSnapshot().settings, facing: 'user' });
    await video.prepare();
    (controller as unknown as { publish: (s: object) => void }).publish({
      state: 'running',
      activity: {
        ...controller.getSnapshot().activity!,
        activeStart: Date.now(),
      },
    });
    await waitRecording();
    controller.finish();
    await video.settle();
    const rows = (await repo.list('alice', a.payload.clientId)).sort(
      (a, b) => a.order - b.order,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.state === 'complete')).toBe(true);
    expect(rows[1]!.start!.rideElapsedMs).toBeGreaterThanOrEqual(
      rows[0]!.end!.rideElapsedMs,
    );
    expect(rows[1]!.requested.facing).toBe('user');
    expect(FakeRecorder.instances).toHaveLength(2);
  });
  it('falha de câmera deixa sessão e dados GPS em andamento', async () => {
    vi.spyOn(video.camera, 'open').mockRejectedValue(
      new DOMException('', 'NotReadableError'),
    );
    await video.prepare();
    run();
    await video.settle();
    expect(controller.getSnapshot().state).toBe('running');
    expect(controller.getSnapshot().activity!.payload.points).toHaveLength(3);
    expect(video.getSnapshot().state).toBe('error');
  });
  it('track suspensa interrompe, preserva dados e não reinicia câmera silenciosamente', async () => {
    await video.prepare();
    run();
    await waitRecording();
    video.camera.stream!.getVideoTracks()[0]!.dispatchEvent(new Event('mute'));
    await video.settle();
    expect(controller.getSnapshot().state).toBe('running');
    expect(video.camera.stream).toBeNull();
    controller.tick();
    expect(FakeRecorder.instances).toHaveLength(1);
  });
  it('save aguarda encerramento e discard remove somente mídia da atividade', async () => {
    await video.prepare();
    const a = run();
    await waitRecording();
    controller.finish();
    await video.settle();
    await controller.discard();
    expect(await repo.list('alice', a.payload.clientId)).toHaveLength(0);
    expect(controller.getSnapshot().state).toBe('discarded');
  });
  it('troca de conta desliga câmera, esconde metadados e mantém mídia da conta anterior', async () => {
    await video.prepare();
    run();
    await waitRecording();
    video.owner('bob');
    await video.settle();
    expect(video.getSnapshot().segments).toEqual([]);
    expect(video.camera.stream).toBeNull();
    expect(await repo.list('alice')).toHaveLength(1);
    expect(await repo.list('bob')).toHaveLength(0);
  });
  it('tempo ativo difere do decorrido, vídeo tardio tem offset e timestamps inválidos são rejeitados', () => {
    run();
    const snapshot = controller.getSnapshot();
    const anchor = videoAnchor(snapshot, Date.now(), 100);
    expect(anchor.rideElapsedMs).toBeGreaterThan(anchor.rideActiveMs);
    expect(anchor.mediaEstimatedMs).toBe(0);
    expect(() => videoAnchor(snapshot, NaN, 10)).toThrow('temporal');
    expect(() => videoAnchor({ ...snapshot, activity: null })).toThrow(
      'temporal',
    );
  });
});
