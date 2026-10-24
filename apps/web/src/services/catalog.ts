import { authRequest } from './auth';
export type Specification = {
  value: string | number;
  unit: string;
  source: number;
};
export interface CatalogVariant {
  id: string;
  model_id: string;
  brand_id: string;
  brand: string;
  model: string;
  model_year: number;
  name: string;
  propulsion: 'combustion' | 'electric';
  category: string | null;
  revision: number;
  specifications: Record<string, Specification>;
  sources: {
    title: string;
    url: string;
    consultedAt: string;
    publishedAt: string | null;
    scope: string;
  }[];
  status: string;
  change_note: string;
}
export const catalogService = {
  facets: (kind: 'brands' | 'models' | 'years', q: string) =>
    authRequest<{ items: { id: string; name: string }[]; hasMore: boolean }>(
      `/catalog/${kind}?${q}`,
    ),
  search: (q: string) =>
    authRequest<{ items: CatalogVariant[]; hasMore: boolean }>(
      `/catalog/variants?${q}`,
    ),
  detail: (id: string, revision?: number) =>
    authRequest<{ variant: CatalogVariant }>(
      `/catalog/variants/${id}${revision ? '?revision=' + revision : ''}`,
    ),
  coverage: () =>
    authRequest<{
      coverage: {
        brands: number;
        models: number;
        variants: number;
        detailed: number;
        awaiting_review: number;
      };
    }>('/catalog/coverage'),
};
export type GarageRecordKind =
  | 'maintenance'
  | 'odometer'
  | 'note'
  | 'insurance'
  | 'document'
  | 'reminder'
  | 'modification';
export interface GarageRecord {
  id: string;
  kind: GarageRecordKind;
  data: Record<string, string | number>;
  revision: number;
  created_at: string;
}
export const garageRecords = {
  list: (id: string, kind: string, page = 1, query = '') =>
    authRequest<{
      items: GarageRecord[];
      hasMore: boolean;
      latest: GarageRecord | null;
    }>(
      `/motorcycles/${id}/records?kind=${kind}&page=${page}&q=${encodeURIComponent(query)}`,
    ),
  create: (
    id: string,
    kind: GarageRecordKind,
    data: Record<string, string | number>,
  ) => authRequest(`/motorcycles/${id}/records`, 'POST', { kind, data }),
  update: (
    id: string,
    row: GarageRecord,
    data: Record<string, string | number>,
  ) =>
    authRequest(`/motorcycles/${id}/records/${row.id}`, 'PATCH', {
      revision: row.revision,
      data,
    }),
  remove: (id: string, row: GarageRecord) =>
    authRequest(`/motorcycles/${id}/records/${row.id}`, 'DELETE', {
      revision: row.revision,
    }),
};
