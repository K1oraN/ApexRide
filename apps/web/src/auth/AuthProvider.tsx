import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { deviceContext } from '../offline/device';
import { offlineRepository } from '../offline/repository';
import {
  ApiError,
  authService,
  clearSession,
  getSession,
  type User,
} from '../services/auth';
import { AuthContext, type AuthState } from './context';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const accountChannel = useRef<BroadcastChannel | null>(null);
  const generation = useRef(0);
  const endSession = useCallback(() => {
    generation.current++;
    void deviceContext.forget().catch(() => {});
    clearSession();
    setUser(null);
    setStatus('ready');
    setError(null);
  }, []);
  const restore = useCallback(() => {
    const ticket = ++generation.current;
    return getSession()
      .then((data) => {
        if (ticket !== generation.current) return;
        void deviceContext.remember(data.user).catch(() => {});
        setUser(data.user);
        setStatus('ready');
        setError(null);
      })
      .catch((error: unknown) => {
        if (ticket !== generation.current) return;
        setUser(null);
        if (error instanceof ApiError && error.status === 401) {
          void deviceContext.forget().catch(() => {});
          setStatus('ready');
          setError(null);
        } else {
          setStatus('error');
          setError(
            error instanceof Error ? error.message : 'API indisponível.',
          );
        }
      });
  }, []);
  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    await restore();
  }, [restore]);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    void restore();
    if (typeof BroadcastChannel !== 'undefined') {
      accountChannel.current = new BroadcastChannel('apex-account');
      accountChannel.current.onmessage = () => {
        clearSession();
        setUser(null);
        setStatus('loading');
        void restore();
      };
    }
    window.addEventListener('apex:session-ended', endSession);
    return () => {
      window.removeEventListener('apex:session-ended', endSession);
      accountChannel.current?.close();
      accountChannel.current = null;
      invalidate();
    };
  }, [restore, endSession]);
  const login = async (email: string, password: string) => {
    const ticket = ++generation.current;
    const data = await authService.login(email, password);
    if (ticket !== generation.current) return;
    await deviceContext.remember(data.user).catch(() => {});
    if (ticket !== generation.current) return;
    accountChannel.current?.postMessage('account-changed');
    setUser(data.user);
    setStatus('ready');
    setError(null);
  };
  const logout = async () => {
    if (user) {
      const pending = await offlineRepository.list(user.id).catch(() => []);
      if (
        pending.some((row) => !row.confirmation) &&
        !window.confirm(
          'Há atividades locais não enviadas ou aguardando decisão. Elas ficarão neste aparelho e exigirão esta mesma conta para recuperação. Sair da conta?',
        )
      )
        return;
    }
    try {
      await authService.logout();
      endSession();
      accountChannel.current?.postMessage('account-changed');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) endSession();
      else throw error;
    }
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        error,
        refresh,
        login,
        logout,
        updateUser: setUser,
        endSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
