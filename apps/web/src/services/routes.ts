import { authRequest } from './auth';
import type {
  RouteRecord,
  RouteData,
  Coordinate,
  Line,
} from '@apex-ride/ride-core/routes';
export type { RouteRecord, RouteData };
export interface RouteList {
  routes: RouteRecord[];
  page: number;
  hasMore: boolean;
}
export const routeService = {
  list: (query: URLSearchParams, scope = '') =>
    authRequest<RouteList>(`/routes${scope}?${query}`),
  detail: (id: string) =>
    authRequest<{ route: RouteRecord }>(`/routes/${encodeURIComponent(id)}`),
  save: (data: RouteData, kind: string, id?: string) =>
    authRequest<{ route: RouteRecord }>(
      `/${kind === 'circuit' ? 'circuits' : 'routes'}${id ? '/' + id : ''}`,
      id ? 'PATCH' : 'POST',
      data,
    ),
  archive: (id: string) => authRequest(`/routes/${id}`, 'DELETE'),
  submit: (id: string) => authRequest(`/routes/${id}/submit`, 'POST'),
  favorite: (id: string, value: boolean) =>
    authRequest(`/routes/${id}/favorite`, value ? 'POST' : 'DELETE'),
  calculate: (waypoints: Coordinate[]) =>
    authRequest<{
      geometry: Line;
      durationSeconds: number | null;
      source: 'osrm';
      distanceMeters: number;
    }>(`/routes/calculate`, 'POST', { waypoints }),
  moderation: () => authRequest<{ routes: RouteRecord[] }>('/admin/routes'),
  decisions: (id: string) =>
    authRequest<{
      decisions: {
        id: number;
        action: string;
        reason: string;
        version: number;
        created_at: string;
      }[];
    }>(`/admin/routes/${id}/decisions`),
  decide: (
    id: string,
    action: string,
    version: number,
    reason: string,
    closedVenue = false,
  ) =>
    authRequest(`/admin/routes/${id}/decisions`, 'POST', {
      action,
      version,
      reason,
      closedVenue,
      evidence: reason,
    }),
};
