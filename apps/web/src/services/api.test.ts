import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiHealth } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('cliente HTTP', () => {
  it('consulta a API e valida a resposta', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', service: 'apex-ride-api' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getApiHealth(new AbortController().signal)).resolves.toEqual({
      status: 'ok',
      service: 'apex-ride-api',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('utiliza a URL pública configurada sem duplicar barra', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', service: 'apex-ride-api' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await getApiHealth(new AbortController().signal);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.com/api/health',
    );
  });

  it('recusa falha HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(getApiHealth(new AbortController().signal)).rejects.toThrow(
      'API indisponível',
    );
  });

  it.each([null, {}, { status: 'ok' }, { status: 'ok', service: 'outro' }])(
    'recusa resposta inválida: %j',
    async (body) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
      );
      await expect(getApiHealth(new AbortController().signal)).rejects.toThrow(
        'Resposta inválida',
      );
    },
  );

  it('propaga falha de rede', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(getApiHealth(new AbortController().signal)).rejects.toThrow(
      'Failed to fetch',
    );
  });

  it('respeita o cancelamento pelo componente', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_url: string, options: RequestInit) => {
        options.signal?.throwIfAborted();
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getApiHealth(controller.signal)).rejects.toThrow();
  });
});
