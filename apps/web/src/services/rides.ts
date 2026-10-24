import type { RideMetrics, RidePayload } from '@apex-ride/ride-core';
import { authRequest } from './auth';
export interface SaveConfirmation {
  local?: boolean;
  status: 'ok';
  id: string;
  metrics: RideMetrics;
}
export const rideService = {
  save: (data: RidePayload) =>
    authRequest<SaveConfirmation>('/rides', 'POST', data),
  list: (offset = 0) =>
    authRequest<{ rides: unknown[]; limit: number; offset: number }>(
      `/rides?offset=${offset}`,
    ),
  detail: (id: string) =>
    authRequest<{ ride: unknown; points: unknown[] }>(
      `/rides/${encodeURIComponent(id)}`,
    ),
};
