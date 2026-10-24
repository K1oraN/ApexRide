import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { authRequest } from '../services/auth';
export function useGamification<T>(path: string | null) {
  const { user } = useAuth(),
    [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
      owner: string;
      path: string;
      data: T;
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!user || !path) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    void authRequest<T>(path, 'GET', undefined, abort.signal)
      .then((data) => {
        // A response already in flight must not restore stale rankings after offline/revocation cleanup.
        if (abort.signal.aborted || navigator.onLine === false) return;
        setResult({ owner: user.id, path, data });
        setError('');
        if (
          path === '/gamification/me' &&
          (data as { progress?: { pending?: boolean } }).progress?.pending
        )
          timer = setTimeout(() => setRevision((n) => n + 1), 2000);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setResult(null);
          setError(e.message);
        }
      });
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [user, path, revision]);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    const offline = () => {
      setResult(null);
      setError('Sem conexão. Consulte novamente quando estiver online.');
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', refresh);
    window.addEventListener('apex:gamification-changed', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('apex:gamification-changed', refresh);
    };
  }, []);
  return {
    data:
      result?.owner === user?.id && result?.path === path ? result.data : null,
    error,
    reload: () => setRevision((n) => n + 1),
  };
}
export async function changeGamification(
  path: string,
  method: string,
  body?: unknown,
) {
  const r = await authRequest(path, method, body);
  window.dispatchEvent(new Event('apex:gamification-changed'));
  return r;
}
