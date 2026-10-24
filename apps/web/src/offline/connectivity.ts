import { apiUrl } from '../services/auth';
export type Connectivity =
  'online' | 'offline' | 'limited' | 'checking' | 'unavailable';
export class ConnectivityService {
  private state: Connectivity = 'checking';
  private checking: Promise<Connectivity> | null = null;
  private checkedAt = -Infinity;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private set(state: Connectivity) {
    this.state = state;
    this.listeners.forEach((f) => f());
    return state;
  }
  check = (force = false): Promise<Connectivity> => {
    if (this.checking) return this.checking;
    if (!navigator.onLine) return Promise.resolve(this.set('offline'));
    if (!force && Date.now() - this.checkedAt < 15_000)
      return Promise.resolve(this.state);
    this.set('checking');
    this.checking = (async () => {
      try {
        const response = await fetch(apiUrl('/health'), {
          cache: 'no-store',
          credentials: 'omit',
          signal: AbortSignal.timeout(5000),
        });
        const data = await response.json().catch(() => null);
        return this.set(
          response.ok &&
            data?.status === 'ok' &&
            data?.service === 'apex-ride-api'
            ? 'online'
            : 'unavailable',
        );
      } catch {
        return this.set(navigator.onLine ? 'limited' : 'offline');
      } finally {
        this.checkedAt = Date.now();
        this.checking = null;
      }
    })();
    return this.checking;
  };
  connect() {
    const changed = () => {
      void this.check(true);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') changed();
    };
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.check();
    }, 60_000);
    changed();
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
      document.removeEventListener('visibilitychange', visible);
    };
  }
}
