import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraService, cameraError } from './camera';
import { defaultVideoSettings } from './types';
import { testStream } from './fixtures';
afterEach(() => vi.restoreAllMocks());
describe('16A câmera e permissões', () => {
  it('detecta contexto inseguro e ausência de suporte sem solicitar permissão', async () => {
    const getUserMedia = vi.fn();
    await expect(
      new CameraService(
        () => ({ getUserMedia }) as unknown as MediaDevices,
        () => false,
      ).open(defaultVideoSettings),
    ).rejects.toThrow('HTTPS');
    await expect(
      new CameraService(
        () => undefined as unknown as MediaDevices,
        () => true,
      ).open(defaultVideoSettings),
    ).rejects.toThrow('não oferece');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it.each(['user', 'environment'] as const)(
    'solicita %s sem áudio e informa a câmera efetivamente obtida',
    async (facing) => {
      const { stream, track } = testStream('user');
      const getUserMedia = vi.fn().mockResolvedValue(stream);
      const camera = new CameraService(
        () => ({ getUserMedia }) as unknown as MediaDevices,
        () => true,
      );
      expect(getUserMedia).not.toHaveBeenCalled();
      const result = await camera.open({ ...defaultVideoSettings, facing });
      expect(getUserMedia.mock.calls[0]![0]).toMatchObject({
        audio: false,
        video: { facingMode: { ideal: facing } },
      });
      expect(result.applied.facingMode).toBe('user');
      camera.close();
      expect(track.stop).toHaveBeenCalledOnce();
    },
  );
  it('reduz constraints uma vez por preset e permite áudio somente explícito', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('', 'OverconstrainedError'))
      .mockResolvedValue(testStream().stream);
    const camera = new CameraService(
      () => ({ getUserMedia }) as unknown as MediaDevices,
      () => true,
    );
    const result = await camera.open({ ...defaultVideoSettings, audio: true });
    expect(result.quality).toBe('economy');
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[0]![0].audio).toBe(true);
    camera.close();
  });
  it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])(
    'não repete solicitação após %s',
    async (name) => {
      const getUserMedia = vi
        .fn()
        .mockRejectedValue(new DOMException('', name));
      await expect(
        new CameraService(
          () => ({ getUserMedia }) as unknown as MediaDevices,
          () => true,
        ).open(defaultVideoSettings),
      ).rejects.toHaveProperty('name', name);
      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(cameraError(new DOMException('', name))).toMatch(
        /permissão|Permissão|encontrado|ocupado/,
      );
    },
  );
  it('cancela permissão pendente e encerra streams recebidas após cancelamento', async () => {
    let resolve!: (s: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((r) => {
          resolve = r;
        }),
    );
    const camera = new CameraService(
      () => ({ getUserMedia }) as unknown as MediaDevices,
      () => true,
    );
    const pending = camera.open(defaultVideoSettings);
    camera.close();
    const { stream, track } = testStream();
    resolve(stream);
    await expect(pending).rejects.toHaveProperty('name', 'AbortError');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(camera.stream).toBeNull();
  });
  it('encerra câmera anterior antes da troca e preserva ausência de stream na falha', async () => {
    const { stream, track } = testStream();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(stream)
      .mockRejectedValue(new DOMException('', 'NotReadableError'));
    const camera = new CameraService(
      () => ({ getUserMedia }) as unknown as MediaDevices,
      () => true,
    );
    await camera.open(defaultVideoSettings);
    await expect(
      camera.open({ ...defaultVideoSettings, facing: 'user' }),
    ).rejects.toThrow();
    expect(track.stop).toHaveBeenCalled();
    expect(camera.stream).toBeNull();
  });
});
