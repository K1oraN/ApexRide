import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  authRequest,
  authService,
  clearSession,
  getSession,
} from './auth';
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
beforeEach(() => {
  clearSession();
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
describe('cliente de autenticação', () => {
  it('usa cookies e centraliza CSRF em memória, sem persistir tokens no navegador', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        reply({ user: { id: '1' }, csrfToken: 'csrf-seguro' }),
      )
      .mockResolvedValueOnce(reply({ status: 'ok' }));
    await authService.login('joao@example.com', 'frase de senha longa');
    await authRequest('/users/me', 'PATCH', { displayName: 'João' });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/auth/login',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        headers: expect.objectContaining({ 'X-Apex-Request': '1' }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/users/me',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-seguro' }),
      }),
    );
    expect(localStorage.length).toBe(0);
  });
  it('deduplica a consulta da sessão em andamento', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const a = getSession(),
      b = getSession();
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(reply({ user: { id: '1' }, csrfToken: 'csrf' }));
    await a;
    vi.mocked(fetch).mockResolvedValue(
      reply({ user: { id: '1' }, csrfToken: 'csrf' }),
    );
    await getSession();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('limpa CSRF e sinaliza sessão revogada ao receber 401 em área pessoal', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ csrfToken: 'anterior' }));
    await getSession();
    const ended = vi.fn();
    window.addEventListener('apex:session-ended', ended);
    vi.mocked(fetch).mockResolvedValueOnce(
      reply({ message: 'Sessão expirada' }, 401),
    );
    await expect(authRequest('/users/me')).rejects.toMatchObject({
      status: 401,
    });
    expect(ended).toHaveBeenCalledOnce();
    window.removeEventListener('apex:session-ended', ended);
    vi.mocked(fetch).mockResolvedValueOnce(reply({ status: 'ok' }));
    await authRequest('/users/me', 'PATCH', {});
    const options = vi.mocked(fetch).mock.calls.at(-1)![1]!;
    expect(options.headers).not.toHaveProperty('X-CSRF-Token');
  });
  it('falha de login não trata uma sessão existente como encerrada', async () => {
    const ended = vi.fn();
    window.addEventListener('apex:session-ended', ended);
    vi.mocked(fetch).mockResolvedValue(
      reply({ message: 'E-mail ou senha inválidos' }, 401),
    );
    await expect(
      authService.login('ausente@example.com', 'senha'),
    ).rejects.toBeInstanceOf(ApiError);
    expect(ended).not.toHaveBeenCalled();
    window.removeEventListener('apex:session-ended', ended);
  });
  it('erro de rede mantém mensagem útil para nova tentativa', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getSession()).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('conectar'),
    });
  });
  it('propaga erros de validação do backend sem substituir por sucesso', async () => {
    vi.mocked(fetch).mockResolvedValue(
      reply({ message: 'Nome de usuário indisponível.' }, 409),
    );
    await expect(
      authRequest('/users/me', 'PATCH', { username: 'existente' }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Nome de usuário indisponível.',
    });
  });
});
