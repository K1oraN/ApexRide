import { afterEach, expect, it, vi } from 'vitest';
import { videoStorageStatus } from './storage-monitor';
afterEach(() => vi.unstubAllGlobals());
it('16C quota ausente não inventa espaço disponível', async () => {
  vi.stubGlobal('navigator', {});
  expect(await videoStorageStatus('standard')).toMatchObject({
    remaining: null,
    low: false,
  });
});
it('16C quota considera qualidade e persistência é pedida apenas explicitamente', async () => {
  const persist = vi.fn(async () => false),
    persisted = vi.fn(async () => false);
  vi.stubGlobal('navigator', {
    storage: {
      estimate: async () => ({
        quota: 100 * 1024 * 1024,
        usage: 70 * 1024 * 1024,
      }),
      persist,
      persisted,
    },
  });
  expect((await videoStorageStatus('high')).low).toBe(true);
  expect((await videoStorageStatus('economy')).low).toBe(false);
  expect(persist).not.toHaveBeenCalled();
  await videoStorageStatus('standard', true);
  expect(persist).toHaveBeenCalledOnce();
});
it('16C erro ao estimar não bloqueia telemetria nem afirma espaço livre', async () => {
  vi.stubGlobal('navigator', {
    storage: {
      estimate: async () => {
        throw new Error('unavailable');
      },
    },
  });
  expect(await videoStorageStatus('standard')).toMatchObject({
    remaining: null,
    low: false,
    message: expect.stringContaining('Não foi possível'),
  });
});
