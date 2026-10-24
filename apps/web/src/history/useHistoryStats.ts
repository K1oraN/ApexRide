import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { historyService } from './service';
import type { HistoryStats } from './stats-types';
export function useHistoryStats(query = '') {
  const { user } = useAuth(),
    [response, setResponse] = useState<{
      owner: string;
      data: HistoryStats;
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (user)
      void historyService
        .stats(new URLSearchParams(query))
        .then((data) => {
          if (live) {
            setResponse({ owner: user.id, data });
            setError('');
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [user?.id, user, query]);
  return {
    data: response?.owner === user?.id ? (response?.data ?? null) : null,
    error,
  };
}
