import { createContext, useContext } from 'react';
import type { NavigationController } from './controller';
export const NavigationContext = createContext<NavigationController | null>(
  null,
);
export function useNavigation() {
  const controller = useContext(NavigationContext);
  if (!controller) throw new Error('Navegação indisponível.');
  return controller;
}
