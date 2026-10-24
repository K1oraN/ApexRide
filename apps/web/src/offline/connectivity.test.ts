import { afterEach, expect, it, vi } from 'vitest';
import { ConnectivityService } from './connectivity';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('navigator.onLine não prova acesso à API; valida serviço, HTTP e falhas separadamente', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', service: 'apex-ride-api' })),
    );
  vi.stubGlobal('fetch', fetch);
  const service = new ConnectivityService();
  expect(await service.check()).toBe('online');
  await service.check();
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(new Response('{}', { status: 503 }));
  expect(await service.check(true)).toBe('unavailable');
  fetch.mockResolvedValue(
    new Response(JSON.stringify({ status: 'ok', service: 'other' })),
  );
  expect(await service.check(true)).toBe('unavailable');
  fetch.mockRejectedValue(new Error('timeout'));
  expect(await service.check(true)).toBe('limited');
  vi.stubGlobal('navigator', { onLine: false });
  expect(await service.check(true)).toBe('offline');
  expect(
    fetch.mock.calls.every((c) => !JSON.stringify(c).includes('latitude')),
  ).toBe(true);
});
