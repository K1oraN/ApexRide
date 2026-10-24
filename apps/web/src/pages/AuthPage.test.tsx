import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/context';
import { AuthPage } from './AuthPage';

afterEach(() => vi.unstubAllGlobals());

it('recuperação habilitada solicita instruções ao backend e mostra a resposta genérica', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ passwordRecoveryAvailable: true }), {
        status: 200,
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message:
            'Se houver uma conta elegível, você receberá um e-mail com as instruções.',
        }),
        { status: 202 },
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const state: AuthState = {
    user: null,
    status: 'ready',
    error: null,
    login: async () => {},
    refresh: async () => {},
    logout: async () => {},
    updateUser: () => {},
    endSession: () => {},
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AuthContext.Provider value={state}>
            <AuthPage mode="forgot" />
          </AuthContext.Provider>
        </MemoryRouter>,
      ),
    );
    expect(container.querySelector('fieldset')?.disabled).toBe(false);
    const input = container.querySelector<HTMLInputElement>(
      'input[name="email"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, 'ana@example.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
    });
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/auth/password/forgot',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'ana@example.com' }),
      }),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Se houver uma conta elegível',
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('bloqueia dois envios de login enquanto o backend responde', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let complete!: () => void;
  const login = vi.fn().mockReturnValue(
    new Promise<void>((resolve) => {
      complete = resolve;
    }),
  );
  const state: AuthState = {
    user: null,
    status: 'ready',
    error: null,
    login,
    refresh: async () => {},
    logout: async () => {},
    updateUser: () => {},
    endSession: () => {},
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AuthContext.Provider value={state}>
            <AuthPage mode="login" />
          </AuthContext.Provider>
        </MemoryRouter>,
      ),
    );
    await act(async () => {
      const form = container.querySelector('form')!;
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(login).toHaveBeenCalledOnce();
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    await act(async () => complete());
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('redefinição remove o token da URL e encerra o estado local da sessão revogada', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState(
    null,
    '',
    `/redefinir-senha#token=${'a'.repeat(43)}`,
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Senha redefinida. Entre com a nova senha.',
        }),
        { status: 200 },
      ),
    ),
  );
  const endSession = vi.fn();
  const state: AuthState = {
    user: null,
    status: 'ready',
    error: null,
    endSession,
    refresh: async () => {},
    login: async () => {},
    logout: async () => {},
    updateUser: () => {},
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AuthContext.Provider value={state}>
            <AuthPage mode="reset" />
          </AuthContext.Provider>
        </MemoryRouter>,
      );
    });
    expect(window.location.hash).toBe('');
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!;
    for (const name of ['password', 'confirmation']) {
      const input = container.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      )!;
      await act(async () => {
        setValue.call(input, 'nova frase de senha muito segura');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
    });
    expect(endSession).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Senha redefinida',
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/password/reset',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: 'a'.repeat(43),
          password: 'nova frase de senha muito segura',
        }),
      }),
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState(null, '', '/');
  }
});
