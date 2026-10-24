import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import type { AuthState } from './context';
import {
  ApiError,
  authService,
  getSession,
  type SessionResponse,
} from '../services/auth';
import { deviceContext } from '../offline/device';
import { offlineRepository } from '../offline/repository';

vi.mock('../services/auth', async (original) => ({
  ...(await original<typeof import('../services/auth')>()),
  getSession: vi.fn(),
  authService: { login: vi.fn(), logout: vi.fn() },
}));
vi.mock('../offline/device', () => ({
  deviceContext: {
    remember: vi.fn().mockResolvedValue(undefined),
    forget: vi.fn().mockResolvedValue(undefined),
    user: vi.fn(),
  },
}));
vi.mock('../offline/repository', () => ({
  offlineRepository: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

const session = {
  user: { id: 'owner', displayName: 'Ana', username: 'ana' },
  csrfToken: 'csrf',
  status: 'ok',
} as SessionResponse;
let state: AuthState;
let root: Root;
let container: HTMLDivElement;
function Probe() {
  const current = useAuth();
  useEffect(() => {
    state = current;
  }, [current]);
  return (
    <span>
      {current.status}:{current.user?.id ?? 'visitor'}
    </span>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () =>
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    ),
  );
}

it('restaura sessão confirmada pelo backend', async () => {
  vi.mocked(getSession).mockResolvedValue(session);
  await mount();
  expect(state.user?.id).toBe('owner');
  expect(state.status).toBe('ready');
});
it.each([0, 503])(
  'indisponibilidade %s preserva dados locais sem autorizar pelo cache',
  async (status) => {
    vi.mocked(getSession).mockRejectedValue(
      new ApiError(status, 'Conexão indisponível.'),
    );
    vi.mocked(deviceContext.user).mockResolvedValue(session.user);
    await mount();
    expect(state.user).toBeNull();
    expect(state.status).toBe('error');
    expect(deviceContext.forget).not.toHaveBeenCalled();
    expect(deviceContext.user).not.toHaveBeenCalled();
    vi.mocked(getSession).mockResolvedValue(session);
    await act(async () => state.refresh());
    expect(state.user?.id).toBe('owner');
  },
);
it('sessão expirada remove a identidade corrente sem apagar atividades', async () => {
  vi.mocked(getSession).mockRejectedValue(
    new ApiError(401, 'Sessão expirada.'),
  );
  await mount();
  expect(state.user).toBeNull();
  expect(state.status).toBe('ready');
  expect(deviceContext.forget).toHaveBeenCalledOnce();
  expect(offlineRepository.list).not.toHaveBeenCalled();
});
it('resposta atrasada de restauração não reabre sessão encerrada', async () => {
  let resolve!: (data: SessionResponse) => void;
  vi.mocked(getSession).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  await mount();
  await act(async () => state.endSession());
  await act(async () => resolve(session));
  expect(state.user).toBeNull();
  expect(state.status).toBe('ready');
});
it('logout real mantém atividades pendentes e respeita confirmação de saída', async () => {
  vi.mocked(getSession).mockResolvedValue(session);
  vi.mocked(authService.logout).mockResolvedValue({});
  vi.mocked(offlineRepository.list).mockResolvedValue([
    { confirmation: null },
  ] as unknown as Awaited<ReturnType<typeof offlineRepository.list>>);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await mount();
  await act(async () => state.logout());
  expect(authService.logout).not.toHaveBeenCalled();
  expect(state.user?.id).toBe('owner');
  confirm.mockReturnValue(true);
  await act(async () => state.logout());
  expect(authService.logout).toHaveBeenCalledOnce();
  expect(state.user).toBeNull();
  confirm.mockRestore();
});
