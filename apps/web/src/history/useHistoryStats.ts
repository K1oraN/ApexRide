import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { historyService } from './service';
import type { HistoryStats } from './stats-types';
export function useHistoryStats(query = '', refreshKey = '') {
  const { user } = useAuth(),
    [revision, setRevision] = useState(0),
    [response, setResponse] = useState<{
      owner: string;
      query: string;
      refreshKey: string;
      data: HistoryStats;
    } | null>(null),
    [failure, setFailure] = useState<{
      owner: string;
      query: string;
      message: string;
    } | null>(null);
  useEffect(() => {
    let live = true;
    if (user)
      void historyService
        .stats(new URLSearchParams(query))
        .then((data) => {
          if (live) {
            setResponse({ owner: user.id, query, refreshKey, data });
            setFailure(null);
          }
        })
        .catch((e) => {
          if (live) {
            setResponse(null);
            setFailure({ owner: user.id, query, message: e.message });
          }
        });
    return () => {
      live = false;
    };
  }, [user?.id, user, query, revision, refreshKey]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, []);
  return {
    data:
      response?.owner === user?.id &&
      response?.query === query &&
      response?.refreshKey === refreshKey
        ? response.data
        : null,
    error:
      failure?.owner === user?.id && failure?.query === query
        ? failure.message
        : '',
    reload: () => setRevision((value) => value + 1),
  };
}
