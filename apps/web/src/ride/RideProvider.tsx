import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/useAuth';
import { OfflineContext } from '../offline/context';
import { OfflineCoordinator } from '../offline/coordinator';
import { VideoContext } from '../video/context';
import { RideVideoIntegration } from '../video/coordinator';
import { RideContext } from './context';
import { RideController } from './controller';
export function RideProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [controller] = useState(() => new RideController());
  const [offline] = useState(() => new OfflineCoordinator(controller));
  const [video] = useState(() => new RideVideoIntegration(controller));
  useEffect(() => video.connect(), [video]);
  useEffect(() => video.owner(user?.id ?? null), [video, user?.id]);
  useEffect(() => offline.connect(), [offline]);
  useEffect(() => {
    offline.owner(user?.id ?? null);
  }, [offline, user?.id]);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    const disconnect = controller.connect();
    const timer = setInterval(controller.tick, 1_000);
    return () => {
      disconnect();
      clearInterval(timer);
      controller.gps.stop();
    };
  }, [controller]);
  useEffect(() => {
    if (
      !user ||
      (controller.getSnapshot().activity &&
        controller.getSnapshot().activity?.ownerId !== user.id)
    )
      controller.accountEnded();
  }, [controller, user]);
  useEffect(() => {
    controller.speed.setMode(user?.telemetry?.speedMode ?? 'assisted');
  }, [controller, user?.id, user?.telemetry?.speedMode]);
  const unsaved = Boolean(snapshot.activity && snapshot.state !== 'saved');
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  return (
    <OfflineContext.Provider value={offline}>
      <RideContext.Provider value={{ controller, snapshot }}>
        <VideoContext.Provider value={video}>{children}</VideoContext.Provider>
      </RideContext.Provider>
    </OfflineContext.Provider>
  );
}
