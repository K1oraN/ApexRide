import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { historyService } from './service';
import type { HistoryStats } from './stats-types';
import { useHistoryStats } from './useHistoryStats';

const account = vi.hoisted(() => ({ user: { id: 'a' } }));
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: account.user }) }));
let root: Root, container: HTMLDivElement;
const stats = (distance: number): HistoryStats => ({
  totals: {
    total: 1,
    distance_meters: distance,
    active_ms: 1000,
    average_kmh: 1,
    motorcycles: 1,
  },
  modes: [],
  motorcycles: [],
  months: [],
  limited: { motorcycles: false, months: false },
  source: 'saved-server-rides',
});
function Example({ query }: { query: string }) {
  const result = useHistoryStats(query);
  return (
    <>
      <output>
        {result.error || result.data?.totals.distance_meters || 'loading'}
      </output>
      <button onClick={result.reload}>Retry</button>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  account.user = { id: 'a' };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('hides old period values and ignores a late response from another period', async () => {
  let resolveOld!: (value: HistoryStats) => void;
  const request = vi
    .spyOn(historyService, 'stats')
    .mockResolvedValueOnce(stats(100))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(stats(300));
  await act(async () => root.render(<Example query="from=first" />));
  expect(container.textContent).toContain('100');
  await act(async () => root.render(<Example query="from=second" />));
  expect(container.textContent).toContain('loading');
  expect(container.textContent).not.toContain('100');
  await act(async () => root.render(<Example query="from=third" />));
  expect(container.textContent).toContain('300');
  await act(async () => resolveOld(stats(200)));
  expect(container.textContent).toContain('300');
  expect(request).toHaveBeenCalledTimes(3);
});
it('a backend failure is unavailable, supports retry and is never treated as zero', async () => {
  vi.spyOn(historyService, 'stats')
    .mockRejectedValueOnce(new Error('Servidor indisponível'))
    .mockResolvedValueOnce(stats(55));
  await act(async () => root.render(<Example query="" />));
  expect(container.querySelector('output')?.textContent).toBe(
    'Servidor indisponível',
  );
  await act(async () => container.querySelector('button')!.click());
  expect(container.querySelector('output')?.textContent).toBe('55');
});
it('switching accounts cannot display the previous account data or failure', async () => {
  let resolvePrevious!: (value: HistoryStats) => void;
  vi.spyOn(historyService, 'stats')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePrevious = resolve;
        }),
    )
    .mockResolvedValueOnce(stats(25));
  await act(async () => root.render(<Example query="" />));
  account.user = { id: 'b' };
  await act(async () => root.render(<Example query="" />));
  await act(async () => resolvePrevious(stats(999)));
  expect(container.querySelector('output')?.textContent).toBe('25');
});
