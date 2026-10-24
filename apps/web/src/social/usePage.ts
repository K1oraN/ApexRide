import { useCallback, useEffect, useRef, useState } from 'react';
import { social } from './service';
import type { Page } from './types';
import { useAuth } from '../auth/useAuth';
export function usePage<T extends { id: string }>(path: string) {
  const { user } = useAuth();
  const scope = `${user?.id ?? 'anonymous'}:${path}`;
  const [data, setData] = useState<Page<T> & { path: string }>({
      path: scope,
      items: [],
      nextCursor: null,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const load = useCallback(
    async (cursor?: string) => {
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError('');
      try {
        const result = await social<Page<T>>(
          `${path}${path.includes('?') ? '&' : '?'}${cursor ? `cursor=${encodeURIComponent(cursor)}` : ''}`,
          'GET',
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setData((old) => ({
            path: scope,
            items: cursor
              ? [
                  ...old.items,
                  ...result.items.filter(
                    (item) => !old.items.some((p) => p.id === item.id),
                  ),
                ]
              : result.items,
            nextCursor: result.nextCursor,
          }));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError((e as Error).message);
          setData({ path: scope, items: [], nextCursor: null });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [path, scope],
  );
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (live) void load();
    });
    return () => {
      live = false;
      active.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load]);
  return {
    data: data.path === scope ? data : { items: [], nextCursor: null },
    loading,
    error,
    reload: () => load(),
    more: () => load(data.nextCursor ?? undefined),
    setData,
  };
}
