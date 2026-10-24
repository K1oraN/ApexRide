import { authRequest } from './auth';
export interface MotorcycleData {
  brand: string;
  model: string;
  year: number;
  displacementCc: number;
}
export interface Motorcycle extends MotorcycleData {
  id: string;
  isPrimary: boolean;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
type One = { motorcycle: Motorcycle };
export const motorcycleService = {
  list: () => authRequest<{ motorcycles: Motorcycle[] }>('/motorcycles'),
  detail: (id: string) =>
    authRequest<One>(`/motorcycles/${encodeURIComponent(id)}`),
  primary: () =>
    authRequest<{ motorcycle: Motorcycle | null }>('/motorcycles/primary'),
  publicGarage: (username: string) =>
    authRequest<{ motorcycles: Motorcycle[] }>(
      `/users/${encodeURIComponent(username)}/motorcycles`,
    ),
  create: (data: MotorcycleData) =>
    authRequest<One>('/motorcycles', 'POST', data),
  update: (id: string, data: MotorcycleData) =>
    authRequest<One>(`/motorcycles/${id}`, 'PATCH', data),
  remove: (id: string) => authRequest(`/motorcycles/${id}`, 'DELETE'),
  setPrimary: (id: string) =>
    authRequest<One>(`/motorcycles/${id}/primary`, 'PATCH'),
  upload: (id: string, file: File) =>
    authRequest<One>(`/motorcycles/${id}/photo`, 'POST', file),
  removePhoto: (id: string) =>
    authRequest<One>(`/motorcycles/${id}/photo`, 'DELETE'),
};
export function validatePhoto(file: File): string | null {
  if (file.size > 5 * 1024 * 1024)
    return 'A fotografia deve ter no máximo 5 MB.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return 'Use JPEG, PNG ou WebP. Conversão de HEIC não está disponível.';
  if (!file.size) return 'Selecione uma fotografia válida.';
  return null;
}
