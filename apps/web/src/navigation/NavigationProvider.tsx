import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { useRide } from '../ride/context';
import { routeService } from '../services/routes';
import { NavigationController } from './controller';
import { NavigationContext } from './context';
export function NavigationProvider({ children }: { children: ReactNode }) {
  const { controller: ride } = useRide(),
    { user } = useAuth();
  const [navigation] = useState(
    () =>
      new NavigationController(
        ride.gps,
        routeService.directions,
        () =>
          ['running', 'waiting-gps'].includes(ride.getSnapshot().state) ||
          ride.gpsShared(),
      ),
  );
  useEffect(() => {
    navigation.owner(user?.id ?? null);
  }, [navigation, user?.id]);
  useEffect(() => {
    ride.setNavigationGpsShared(navigation.isActive);
    const off = navigation.connect();
    window.addEventListener('online', navigation.connectivity);
    window.addEventListener('offline', navigation.connectivity);
    return () => {
      off();
      navigation.end();
      ride.setNavigationGpsShared(() => false);
      window.removeEventListener('online', navigation.connectivity);
      window.removeEventListener('offline', navigation.connectivity);
    };
  }, [navigation, ride]);
  return (
    <NavigationContext.Provider value={navigation}>
      {children}
    </NavigationContext.Provider>
  );
}
