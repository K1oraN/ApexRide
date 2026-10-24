import { authRequest, ApiError } from '../services/auth';
export type AdminAccess = {
  id: string;
  permissions: string[];
  roles: string[];
  verified: boolean;
  mfaEnrolled: boolean;
};
export type Row = Record<string, unknown>;
export async function adminRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await authRequest<T>(path, method, body, signal);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403))
      window.dispatchEvent(new Event('apex:admin-denied'));
    throw e;
  }
}
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Serviço temporariamente indisponível.';
