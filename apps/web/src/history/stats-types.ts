import type { HistoryRide } from './types';
export interface HistoryStats {
  totals: {
    total: number;
    distance_meters: number;
    active_ms: number;
    average_kmh: number | null;
    motorcycles: number;
  };
  modes: {
    mode: string;
    total: number;
    distance_meters: number;
    active_ms: number;
  }[];
  motorcycles: {
    id: string;
    motorcycle: HistoryRide['motorcycle_snapshot'];
    total: number;
    distance_meters: number;
  }[];
  months: {
    month: string;
    total: number;
    distance_meters: number;
    active_ms: number;
  }[];
  limited: { motorcycles: boolean; months: boolean };
  source: 'saved-server-rides';
}
