import { useSyncExternalStore } from 'react';
import { useRide } from './context';
export function useMotion() {
  const { controller } = useRide();
  return useSyncExternalStore(
    controller.motion.subscribe,
    controller.motion.getSnapshot,
  );
}
