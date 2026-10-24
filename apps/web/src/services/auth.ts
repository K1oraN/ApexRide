export interface Privacy {
  profileVisibility: 'public' | 'private';
  activityVisibility: 'public' | 'private';
  liveLocationEnabled: false;
}
export interface User {
  administrativeAccess?: boolean;
  telemetry?: { speedMode: 'assisted' | 'pure' };
  id: string;
  displayName: string;
  username: string;
  email: string;
  emailVerified: boolean;
  biography: string;
  city: string;
  state: string;
  avatarRef: string | null;
  createdAt: string;
  privacy: Privacy;
}
export interface SessionResponse {
  status: 'ok';
  user: User;
  csrfToken: string;
}
export interface LegalConfig {
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string;
  privacyUrl: string;
  preliminary: boolean;
}
export interface Registration {
  displayName: string;
  username: string;
  email: string;
  password: string;
  city: string;
  state: string;
  acceptTerms: boolean;
  termsVersion: string;
  privacyVersion: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let csrfToken: string | null = null;
let sessionRequest: Promise<SessionResponse> | null = null;
const base = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
export const apiUrl = (path: string) => `${base}${path}`;
export function clearSession() {
  csrfToken = null;
}
export async function authRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const binary = body instanceof Blob;
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      credentials: 'include',
      signal: signal
        ? AbortSignal.any([
            signal,
            AbortSignal.timeout(binary ? 30_000 : 15_000),
          ])
        : AbortSignal.timeout(binary ? 30_000 : 15_000),
      headers: {
        Accept: 'application/json',
        'X-Apex-Request': '1',
        ...(body === undefined
          ? {}
          : {
              'Content-Type': binary
                ? body.type || 'application/octet-stream'
                : 'application/json',
            }),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      ...(body === undefined
        ? {}
        : { body: binary ? body : JSON.stringify(body) }),
    });
  } catch {
    signal?.throwIfAborted();
    throw new ApiError(
      0,
      'Não foi possível conectar. Confira sua conexão e tente novamente.',
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      clearSession();
      window.dispatchEvent(new Event('apex:session-ended'));
    }
    throw new ApiError(
      response.status,
      data?.message ?? 'Não foi possível concluir a solicitação.',
    );
  }
  if (data?.csrfToken) csrfToken = data.csrfToken;
  return data as T;
}
export function getSession() {
  sessionRequest ??= authRequest<SessionResponse>('/auth/me').finally(() => {
    sessionRequest = null;
  });
  return sessionRequest;
}
export const authService = {
  login: (email: string, password: string) =>
    authRequest<SessionResponse>('/auth/login', 'POST', { email, password }),
  register: (data: Registration) =>
    authRequest<{ message: string }>('/auth/register', 'POST', data),
  logout: () => authRequest('/auth/logout', 'POST', {}),
  config: () =>
    authRequest<{
      legal: LegalConfig;
      emailVerificationRequired: boolean;
      passwordRecoveryAvailable: boolean;
    }>('/auth/config'),
};
