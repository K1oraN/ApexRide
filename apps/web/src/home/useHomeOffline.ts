import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/useAuth';
import { useOffline } from '../offline/context';

export function useHomeOffline() {
  const { user } = useAuth();
  const offline = useOffline();
  useEffect(() => {
    // Finish the existing checkpoint before reading sessions for the dashboard.
    void offline
      .flush()
      .then(offline.refresh)
      .catch(() => {});
  }, [offline]);
  const state = useSyncExternalStore(offline.subscribe, offline.getSnapshot);
  const connection = useSyncExternalStore(
    offline.connectivity.subscribe,
    offline.connectivity.getSnapshot,
  );
  return {
    connection,
    error: state.error,
    sessions: state.sessions.filter((row) => row.ownerId === user?.id),
    queue: state.queue.filter((row) => row.ownerId === user?.id),
  };
}
export type HomeOffline = ReturnType<typeof useHomeOffline>;
