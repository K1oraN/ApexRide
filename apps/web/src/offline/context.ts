import { createContext, useContext } from 'react';
import type { OfflineCoordinator } from './coordinator';
export const OfflineContext = createContext<OfflineCoordinator | null>(null);
export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('Offline indisponível.');
  return value;
}
