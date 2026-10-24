import { authRequest } from '../services/auth';
import type { Line } from '@apex-ride/ride-core/routes';
import type { ComparisonResult } from '../comparison/types';
export interface SimilarMatch {
  id: string;
  title: string;
  classification: string;
  direction: string;
  sharedMeters: number;
  coverageA: number;
  coverageB: number;
  issues: string[];
  city: string | null;
  state: string | null;
  pieces: {
    geometry: Line;
    a: [number, number];
    b: [number, number];
    direction: string;
    meters: number;
  }[];
}
export interface SimilarStatus {
  status: string;
  reason?: string | null;
  version: string;
  truncated?: boolean;
}
export const labels: Record<string, string> = {
  full: 'Muito semelhante',
  partial: 'Parcialmente semelhante',
  opposite: 'Semelhante em sentido contrário',
  limited: 'Correspondência limitada',
  inconclusive: 'Inconclusivo',
  none: 'Não semelhante',
};
export const statusLabels: Record<string, string> = {
  queued: 'Aguardando análise',
  processing: 'Procurando trajetos',
  done: 'Análise concluída',
  insufficient: 'Dados insuficientes',
  error: 'Erro de análise',
};
export const similarityService = {
  status: (id: string) =>
    authRequest<SimilarStatus>(`/rides/${id}/similarity-status`),
  list: (id: string, q: URLSearchParams, signal?: AbortSignal) =>
    authRequest<{ matches: SimilarMatch[]; page: number; hasMore: boolean }>(
      `/rides/${id}/similar?${q}`,
      'GET',
      undefined,
      signal,
    ),
  groups: () =>
    authRequest<{ groups: string[][]; truncated: boolean }>(
      '/rides/similar-groups',
    ),
  compare: (id: string, other: string) =>
    authRequest<ComparisonResult>(`/rides/${id}/similar/compare`, 'POST', {
      activityId: other,
    }),
  reprocess: (id: string) =>
    authRequest(`/rides/${id}/similarity/reprocess`, 'POST', {}),
  regions: () =>
    authRequest<{ regions: { id: string; city: string; state: string }[] }>(
      '/similarity/regions',
    ),
  community: (q: URLSearchParams) =>
    authRequest<{
      available: boolean;
      message: string;
      summary?: { approximateKm: number };
    }>('/similarity/community?' + q),
};
