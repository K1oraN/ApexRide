import { authRequest } from '../services/auth';
import type { ComparisonResult, SelectionData, CommunityStats } from './types';
export const comparisonService = {
  candidates: (route: string, q: URLSearchParams, signal?: AbortSignal) =>
    authRequest<SelectionData>(
      `/routes/${route}/comparison-candidates?${q}`,
      'GET',
      undefined,
      signal,
    ),
  compare: (route: string, activityIds: string[], signal?: AbortSignal) =>
    authRequest<ComparisonResult>(
      `/routes/${route}/compare`,
      'POST',
      { activityIds },
      signal,
    ),
  laps: (route: string, activityIds: string[], lapNumbers: number[]) =>
    authRequest<ComparisonResult>(`/circuits/${route}/compare-laps`, 'POST', {
      activityIds,
      lapNumbers,
    }),
  stats: (route: string, q: URLSearchParams) =>
    authRequest<CommunityStats>(`/routes/${route}/comparison-stats?${q}`),
  privacy: (ride: string, enabled: boolean, technical: boolean) =>
    authRequest(`/rides/${ride}/comparison-privacy`, 'PATCH', {
      enabled,
      technical,
    }),
};
