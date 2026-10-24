import { createContext, useContext } from 'react';
import type { Motorcycle } from '../services/motorcycles';
export interface GarageState {
  offline?: boolean;
  motorcycles: Motorcycle[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
export const GarageContext = createContext<GarageState | null>(null);
export function useGarage() {
  const value = useContext(GarageContext);
  if (!value) throw new Error('Garagem indisponível');
  return value;
}
