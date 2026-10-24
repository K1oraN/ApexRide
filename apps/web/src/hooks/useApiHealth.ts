import { useEffect, useState } from 'react';
import { getApiHealth } from '../services/api';

export function useApiHealth() {
  const [status, setStatus] = useState<
    'checking' | 'connected' | 'unavailable'
  >('checking');
  useEffect(() => {
    const controller = new AbortController();
    void getApiHealth(controller.signal).then(
      () => {
        if (!controller.signal.aborted) setStatus('connected');
      },
      () => {
        if (!controller.signal.aborted) setStatus('unavailable');
      },
    );
    return () => controller.abort();
  }, []);
  return status;
}
