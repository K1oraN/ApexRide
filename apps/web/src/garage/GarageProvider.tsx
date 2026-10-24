import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/useAuth';
import { deviceContext } from '../offline/device';
import { ApiError } from '../services/auth';
import { motorcycleService, type Motorcycle } from '../services/motorcycles';
import { GarageContext } from './context';
export function GarageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const version = useRef(0);
  const [state, setState] = useState<{
    owner?: string | undefined;
    motorcycles: Motorcycle[];
    loading: boolean;
    error: string | null;
  }>({ motorcycles: [], loading: true, error: null });
  const refresh = useCallback(() => {
    const ticket = ++version.current;
    if (!userId) return Promise.resolve();
    return motorcycleService
      .list()
      .then((data) => {
        void deviceContext
          .rememberBikes(userId, data.motorcycles)
          .catch(() => {});
        if (ticket === version.current)
          setState({
            owner: userId,
            motorcycles: data.motorcycles,
            loading: false,
            error: null,
          });
      })
      .catch(async (error: unknown) => {
        const cached =
          error instanceof ApiError &&
          (error.status === 0 || error.status >= 500)
            ? await deviceContext.bikes(userId).catch(() => [])
            : [];
        if (ticket === version.current)
          setState({
            owner: userId,
            motorcycles: cached,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Falha ao carregar a garagem.',
          });
      });
  }, [userId]);
  const invalidate = useCallback(() => {
    version.current++;
  }, []);
  useEffect(() => {
    void refresh();
    return invalidate;
  }, [refresh, invalidate]);
  const current = state.owner === userId;
  return (
    <GarageContext.Provider
      value={{
        motorcycles: current ? state.motorcycles : [],
        loading: Boolean(userId) && (!current || state.loading),
        error: current ? state.error : null,
        offline:
          current && Boolean(state.error) && state.motorcycles.length > 0,
        refresh,
      }}
    >
      {children}
    </GarageContext.Provider>
  );
}
