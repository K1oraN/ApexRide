import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/useAuth';
import { useRide } from '../ride/context';
import { LiveContext } from './live-context';
import { LiveLocationController } from './live-controller';
export function LiveProvider({ children }: { children: ReactNode }) {
  const { controller: ride } = useRide(),
    { user } = useAuth();
  const [controller] = useState(
    () =>
      new LiveLocationController(
        ride.gps,
        undefined,
        () => {
          const a = ride.getSnapshot().activity;
          return a && !a.payload.endedAt ? a.payload.clientId : null;
        },
        () =>
          (!!ride.getSnapshot().activity &&
            !ride.getSnapshot().activity?.payload.endedAt) ||
          ride.navigationGpsShared(),
      ),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.owner(user?.id ?? null);
  }, [controller, user?.id]);
  useEffect(() => {
    ride.setGpsShared(() => !!controller.getSnapshot().session);
    const off = ride.subscribe(controller.rideChanged);
    return () => {
      off();
      ride.setGpsShared(() => false);
    };
  }, [controller, ride]);
  useEffect(() => {
    const tick = setInterval(() => void controller.tick(), 5000);
    const stop = () =>
      controller.stop(
        'Compartilhamento interrompido. Autorize novamente para retomar.',
      );
    const visibility = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    const flush = () => void controller.flush();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', stop);
    window.addEventListener('pagehide', stop);
    window.addEventListener('online', flush);
    window.addEventListener('apex:session-ended', stop);
    return () => {
      clearInterval(tick);
      controller.stop();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', stop);
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('online', flush);
      window.removeEventListener('apex:session-ended', stop);
    };
  }, [controller]);
  return (
    <LiveContext.Provider value={{ controller, state }}>
      {children}
    </LiveContext.Provider>
  );
}
