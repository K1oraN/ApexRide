import { authRequest } from '../services/auth';
import type { EventMapData, SocialEvent, EventInvitation } from './types';
export const events = {
  list: (q: URLSearchParams, signal?: AbortSignal) =>
    authRequest<{ items: SocialEvent[]; hasMore: boolean }>(
      `/events?${q}`,
      'GET',
      undefined,
      signal,
    ),
  detail: (id: string, signal?: AbortSignal) =>
    authRequest<{ event: SocialEvent }>(
      `/events/${id}`,
      'GET',
      undefined,
      signal,
    ),
  map: (id: string, signal?: AbortSignal) =>
    authRequest<EventMapData>(`/events/${id}/map`, 'GET', undefined, signal),
  save: (body: unknown, id?: string) =>
    authRequest<{ event: SocialEvent }>(
      id ? `/events/${id}` : '/events',
      id ? 'PATCH' : 'POST',
      body,
    ),
  invitations: () =>
    authRequest<{ items: EventInvitation[] }>('/events/invitations/mine'),
  action: (id: string, path: string, method = 'POST', body: unknown = {}) =>
    authRequest(`/events/${id}/${path}`, method, body),
};
