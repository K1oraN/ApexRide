import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './returnTo';

describe('retorno após autenticação', () => {
  it.each([
    '/app',
    '/ride?moto=123&rota=456',
    '/historico/123/replay#graficos',
    '/comunidade/eventos/123/mapa',
    '/garagem/123/editar',
    '/explorar/123/comparar',
    '/perfil/conquistas',
    '/privacidade',
  ])('preserva caminho interno e contexto: %s', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });
  it.each([
    null,
    '',
    'https://evil.example/ride',
    '//evil.example/ride',
    '/\\evil.example/ride',
    '/%2f%2fevil.example',
    '/ride/%252fexample',
    '/ride/%2e%2e/entrar',
    '/ride/../../entrar',
    '/ride\n',
    '/entrar?retorno=/ride',
    '/cadastro',
    '/admin',
    '/api/auth/me',
    '/ride-malicioso',
    '/nao-existe',
    '/ride/%ZZ',
  ])('rejeita destino externo, ambíguo ou fora do app: %s', (path) => {
    expect(safeReturnTo(path)).toBe('/app');
  });
});
