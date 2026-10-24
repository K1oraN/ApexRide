import { createContext, useContext } from 'react';
import type { RideController, RideSnapshot } from './controller';
export const RideContext = createContext<{
  controller: RideController;
  snapshot: RideSnapshot;
} | null>(null);
export function useRide() {
  const value = useContext(RideContext);
  if (!value) throw new Error('Ride indisponível');
  return value;
}
