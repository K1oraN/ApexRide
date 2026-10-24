export interface HistoryRide {
  id: string;
  client_id: string;
  title: string;
  description: string;
  mode: 'passeio' | 'pista' | 'misto';
  visibility: 'public' | 'private';
  motorcycle_id: string;
  motorcycle_snapshot: {
    brand: string;
    model: string;
    year: number;
    displacementCc: number | null;
    historicalFallback?: boolean;
  } | null;
  started_at: string;
  ended_at: string;
  active_ms: number;
  paused_ms: number;
  distance_meters: number;
  average_kmh: number | null;
  maximum_kmh: number | null;
  route_id: string | null;
  route_name: string | null;
  route_completion: string | null;
  updated_at: string;
}
export interface HistoryResult {
  rides: HistoryRide[];
  total: number;
  hasMore: boolean;
  page: number;
  limit: number;
  offset: number;
}
export interface HistoryOptions {
  motorcycles: { id: string; motorcycle: HistoryRide['motorcycle_snapshot'] }[];
  routes: { id: string; name: string }[];
}
