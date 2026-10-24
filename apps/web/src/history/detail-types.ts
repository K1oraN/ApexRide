import type { HistoryRide } from './types';
import type { MotionPayload } from '@apex-ride/ride-core/motion';
import type { RoutePlan, RouteProgress } from '@apex-ride/ride-core/routes';
import type { ChartData } from '@apex-ride/ride-core/charts';
import type {
  AdvancedTelemetry,
  PerformanceEvent,
} from '@apex-ride/ride-core/telemetry';
export interface HistoryDetail extends HistoryRide {
  comparison_enabled?: boolean;
  comparison_technical?: boolean;
  route_snapshot: RoutePlan | null;
  route_result:
    (RouteProgress & { completion: string; inconclusiveLaps: number }) | null;
  point_count: number;
  event_count: number;
  lap_count: number;
  best_lap_ms: number | null;
  motion: Omit<MotionPayload, 'samples'> | null;
  telemetry_summary: Omit<AdvancedTelemetry, 'events'> | null;
}
export interface HistoryTelemetry {
  series: ChartData;
  originalCounts: { gps: number; motion: number; speed: number };
  speed: {
    version: string | null;
    truncated: boolean;
    assistedSamples: number | null;
    gpsSamples: number | null;
    unavailableSamples: number | null;
  };
}
export interface HistoryLap {
  number: number;
  start: number;
  end: number;
  durationMs: number;
  status: string;
  quality: { accuracy: number; estimated: boolean; method: string };
}
export interface DataPage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
export type EventPage = DataPage<PerformanceEvent>;
