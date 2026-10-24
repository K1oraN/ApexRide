import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/context';
import { AuthPage } from './AuthPage';

afterEach(() => vi.unstubAllGlobals());

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
