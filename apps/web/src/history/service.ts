import { authRequest } from '../services/auth';
import type { HistoryOptions, HistoryResult } from './types';
import type {
  HistoryDetail,
  HistoryTelemetry,
  HistoryLap,
  EventPage,
  DataPage,
} from './detail-types';
import type { TrackPreview } from '@apex-ride/ride-core/history';
import type { HistoryStats } from './stats-types';
export const historyService = {
  list: (query: URLSearchParams) =>
    authRequest<HistoryResult>(`/rides?${query}`),
  options: () => authRequest<HistoryOptions>('/rides/filters'),
  detail: (id: string) =>
    authRequest<{ ride: HistoryDetail }>(
      `/rides/${encodeURIComponent(id)}?view=summary`,
    ),
  track: (id: string) =>
    authRequest<TrackPreview>(`/rides/${encodeURIComponent(id)}/track`),
  telemetry: (id: string) =>
    authRequest<HistoryTelemetry>(`/rides/${encodeURIComponent(id)}/telemetry`),
  events: (id: string, page = 1, signal?: AbortSignal) =>
    authRequest<EventPage>(
      `/rides/${encodeURIComponent(id)}/events?page=${page}`,
      'GET',
      undefined,
      signal,
    ),
  laps: (id: string, page = 1, signal?: AbortSignal) =>
    authRequest<DataPage<HistoryLap>>(
      `/rides/${encodeURIComponent(id)}/laps?page=${page}`,
      'GET',
      undefined,
      signal,
    ),
  update: (
    id: string,
    data: {
      title: string;
      description: string;
      visibility: 'public' | 'private';
    },
  ) => authRequest(`/rides/${encodeURIComponent(id)}`, 'PATCH', data),
  remove: (id: string) =>
    authRequest(`/rides/${encodeURIComponent(id)}`, 'DELETE'),
  stats: (query: URLSearchParams) =>
    authRequest<HistoryStats>(`/rides/stats?${query}`),
  receipts: (ids: string[]) =>
    authRequest<{
      receipts: { clientId: string; id: string | null; deleted: boolean }[];
    }>(`/rides/receipts?ids=${ids.join(',')}`),
};
