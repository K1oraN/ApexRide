import { useEffect, useState, useSyncExternalStore } from 'react';
import { GpsPreview } from '../services/gps/preview';

export function useGpsPreview() {
  const [preview] = useState(() => new GpsPreview());
  const state = useSyncExternalStore(preview.subscribe, preview.getSnapshot);
  useEffect(() => () => preview.stop(), [preview]);
  return {
    ...state,
    start: preview.start,
    stop: preview.stop,
    retry: preview.retry,
  };
}
