import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECORDER_TIMEOUT_MS,
  recorderMime,
  VideoRecorderService,
} from './recorder';
import { FakeRecorder, testStream } from './fixtures';
const Recorder = FakeRecorder as unknown as typeof MediaRecorder;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  FakeRecorder.instances = [];
});
function setup() {
  const callbacks = {
    started: vi.fn(async () => {}),
    chunk: vi.fn<(blob: Blob, order: number, at: number) => Promise<void>>(
      async () => {},
    ),
    fault: vi.fn(),
    ended: vi.fn(),
  };
  const service = new VideoRecorderService(
    testStream().stream,
    1000,
    callbacks,
    Recorder,
  );
  return { service, callbacks, fake: FakeRecorder.instances.at(-1)! };
}
describe('16B MediaRecorder e finalização', () => {
  it('ausência de confirmação de start encerra com timeout e captura incompleta', async () => {
    vi.useFakeTimers();
    const { service, fake } = setup();
    fake.start = () => {
      fake.state = 'recording';
    };
    const started = service.start();
    const rejected = expect(started).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(RECORDER_TIMEOUT_MS);
    await rejected;
    expect((await service.stop()).captureComplete).toBe(false);
  });
  it('negocia MP4 e rejeita ausência de codec', () => {
    expect(recorderMime(Recorder)).toBe('video/mp4');
    expect(() =>
      recorderMime({
        isTypeSupported: () => false,
      } as unknown as typeof MediaRecorder),
    ).toThrow('formato');
  });
  it('confirma início, ignora vazio, mantém ordem/tamanho e aguarda último chunk', async () => {
    const { service, fake, callbacks } = setup();
    await service.start();
    fake.data('first');
    fake.data('');
    fake.data('second-long');
    const firstStop = service.stop();
    expect(service.stop()).toBe(firstStop);
    expect((await firstStop).complete).toBe(true);
    expect(callbacks.chunk.mock.calls.map((a) => a[1])).toEqual([0, 1, 2]);
    expect(callbacks.chunk.mock.calls.map((a) => a[0].size)).toEqual([
      5, 11, 5,
    ]);
    expect(callbacks.ended).toHaveBeenCalledOnce();
    await expect(service.start()).rejects.toThrow();
  });
  it('finalização espera escrita atrasada sem perder o último bloco', async () => {
    const { service, callbacks } = setup();
    let release!: () => void;
    callbacks.chunk.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    await service.start();
    const stopped = service.stop();
    await vi.waitFor(() => expect(callbacks.chunk).toHaveBeenCalled());
    let finished = false;
    void stopped.then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    release();
    expect((await stopped).complete).toBe(true);
  });
  it('falha de escrita encerra somente gravador e preserva erro de quota', async () => {
    const { service, fake, callbacks } = setup();
    callbacks.chunk.mockRejectedValueOnce(
      new DOMException('', 'QuotaExceededError'),
    );
    await service.start();
    fake.data('data');
    await vi.waitFor(() => expect(callbacks.fault).toHaveBeenCalled());
    expect((await service.stop()).complete).toBe(false);
    expect(callbacks.fault.mock.calls[0]![1]).toHaveProperty(
      'name',
      'QuotaExceededError',
    );
  });
  it('encerramento inesperado ou erro de encoder gera segmento incompleto', async () => {
    const { service, fake } = setup();
    await service.start();
    fake.onerror?.();
    expect((await service.stop()).complete).toBe(false);
  });
  it('ausência de evento stop tem timeout e ignora dados posteriores', async () => {
    vi.useFakeTimers();
    const { service, fake, callbacks } = setup();
    await service.start();
    fake.stop = () => {
      fake.state = 'inactive';
    };
    const stopped = service.stop();
    await vi.advanceTimersByTimeAsync(RECORDER_TIMEOUT_MS);
    expect((await stopped).complete).toBe(false);
    fake.data('late');
    expect(callbacks.chunk).not.toHaveBeenCalled();
  });
});
