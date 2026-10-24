import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authRequest, clearSession } from './auth';
import { motorcycleService, validatePhoto } from './motorcycles';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  clearSession();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
describe('serviço de motocicletas', () => {
  it('envia arquivo binário com a mesma sessão e CSRF das contas', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: 'test-csrf' }), { status: 200 }),
    );
    await authRequest('/auth/me');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ motorcycle: { id: 'bike' } }), {
        status: 200,
      }),
    );
    const file = new File(['image-bytes'], 'gps.jpg', { type: 'image/jpeg' });
    await motorcycleService.upload('bike', file);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/motorcycles/bike/photo',
      expect.objectContaining({
        method: 'POST',
        body: file,
        credentials: 'include',
        headers: expect.objectContaining({
          'X-CSRF-Token': 'test-csrf',
          'Content-Type': 'image/jpeg',
          'X-Apex-Request': '1',
        }),
      }),
    );
  });
  it('preserva mensagem de falha de armazenamento retornada pela API', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Armazenamento indisponível.' }), {
        status: 503,
      }),
    );
    await expect(
      motorcycleService.upload(
        'bike',
        new File(['bytes'], 'photo.png', { type: 'image/png' }),
      ),
    ).rejects.toThrow('Armazenamento indisponível.');
  });
  it('rejeita HEIC e imagens maiores que 5 MB antes do envio', () => {
    expect(
      validatePhoto(new File(['bytes'], 'photo.heic', { type: 'image/heic' })),
    ).toContain('HEIC');
    expect(
      validatePhoto(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'photo.jpg', {
          type: 'image/jpeg',
        }),
      ),
    ).toContain('5 MB');
    expect(
      validatePhoto(new File(['bytes'], 'photo.webp', { type: 'image/webp' })),
    ).toBeNull();
  });
});
