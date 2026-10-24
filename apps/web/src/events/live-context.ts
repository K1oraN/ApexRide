import { createContext, useContext } from 'react';
import type { LiveLocationController, LiveState } from './live-controller';
export const LiveContext = createContext<{
  controller: LiveLocationController;
  state: LiveState;
} | null>(null);
export function useLiveLocation() {
  const context = useContext(LiveContext);
  if (!context) throw new Error('Localização social indisponível.');
  return context;
}
