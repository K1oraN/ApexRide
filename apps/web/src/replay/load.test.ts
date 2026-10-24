import { describe, it, expect, vi } from 'vitest';
import { readPages, localReplay } from './load';
import { fixture } from './fixtures';
describe('13D paginated original series', () => {
  it('loads all original pages in order, reporting progress', async () => {
    const progress = vi.fn();
    const items = await readPages(
      async (page) => ({ items: [page * 1000], page, hasMore: page < 3 }),
      5,
      new AbortController().signal,
      progress,
    );
    expect(items).toEqual([1000, 2000, 3000]);
    expect(progress).toHaveBeenLastCalledWith(3);
  });
  it('stops fetching after navigation cancellation', async () => {
    const abort = new AbortController();
    const request = vi.fn(async (page: number) => {
      abort.abort();
      return { items: [page], page, hasMore: true };
    });
    await expect(
      readPages(request, 10, abort.signal, () => {}),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not accept empty infinite pages, wrong offsets or oversized series', async () => {
    for (const response of [
      { items: [], page: 1, hasMore: true },
      { items: [1], page: 2, hasMore: false },
      { items: [1, 2, 3], page: 1, hasMore: false },
    ])
      await expect(
        readPages(
          async () => response,
          2,
          new AbortController().signal,
          () => {},
        ),
      ).rejects.toThrow();
  });
  it('propagates missing/deleted/private activity errors', async () => {
    await expect(
      readPages(
        async () => {
          throw new Error('Atividade não encontrada.');
        },
        5,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow('Atividade não encontrada.');
  });
  it('reuses local measurements and never detects new laps or events', () => {
    const p = fixture(),
      r = localReplay(p);
    expect(r.payload).toBe(p);
    expect(r.laps).toEqual([]);
    expect(p.telemetry).toBeUndefined();
  });
});
