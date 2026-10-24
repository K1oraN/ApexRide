import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { authenticate } from './auth-fixtures';
import { randomUUID } from 'node:crypto';

test('cadastro valida campos, duplicidade e mantém retorno até o login real', async ({
  page,
}) => {
  const id = randomUUID().replaceAll('-', '').slice(0, 12);
  const data = {
    displayName: 'Ana Piloto',
    username: `ana_${id}`,
    email: `ana_${id}@example.com`,
    password: 'uma frase de senha muito segura',
    acceptTerms: true,
    termsVersion: 'prelaunch-draft',
    privacyVersion: 'prelaunch-draft',
  };
  expect(
    (
      await page.request.post('/api/auth/register', {
        headers: { 'X-Apex-Request': '1' },
        data,
      })
    ).status(),
  ).toBe(201);
  await page.goto('/cadastro?retorno=%2Fhistorico%3Fmodo%3Dpasseio');
  await page.getByLabel('Nome completo').fill(data.displayName);
  await page.getByLabel('Nome de usuário', { exact: true }).fill(data.username);
  await page.getByLabel('E-mail', { exact: true }).fill('email-invalido');
  await page.getByLabel('Senha', { exact: true }).fill(data.password);
  await page.getByLabel('Confirmar senha', { exact: true }).fill(data.password);
  await page.getByRole('checkbox').check();
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/register')) requests++;
  });
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  expect(
    await page
      .getByLabel('E-mail', { exact: true })
      .evaluate((input: HTMLInputElement) => input.validity.typeMismatch),
  ).toBe(true);
  expect(requests).toBe(0);
  await page.getByLabel('E-mail', { exact: true }).fill(data.email);
  await page.getByLabel('Senha', { exact: true }).fill('curta');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  expect(
    await page
      .getByLabel('Senha', { exact: true })
      .evaluate((input: HTMLInputElement) => input.validity.tooShort),
  ).toBe(true);
  expect(requests).toBe(0);
  await page.getByLabel('Senha', { exact: true }).fill(data.password);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível cadastrar',
  );
  expect(requests).toBe(1);
  await page.getByLabel('Nome de usuário', { exact: true }).fill(`novo_${id}`);
  await page
    .getByLabel('E-mail', { exact: true })
    .fill(`novo_${id}@example.com`);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Conta criada');
  await page.getByRole('link', { name: 'Voltar para entrar' }).click();
  await page
    .getByLabel('E-mail ou usuário', { exact: true })
    .fill(`novo_${id}`);
  await page.getByLabel('Senha', { exact: true }).fill(data.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/historico\?modo=passeio$/);
});

test('entrada pública tem seções, CTAs, FAQ e menu acessíveis sem hardware ou sessão', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = () => {
      throw new Error('GPS não solicitado');
    };
    navigator.geolocation.getCurrentPosition = () => {
      throw new Error('GPS não solicitado');
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('SUA PILOTAGEM.');
  await expect(page.locator('.app-shell')).toHaveCount(0);
  for (const id of ['recursos', 'como-funciona', 'privacidade', 'duvidas'])
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(
    page.getByRole('button', { name: 'Fechar menu' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page
    .getByRole('navigation', { name: 'Navegação do site' })
    .getByRole('link', { name: 'Dúvidas' })
    .click();
  await expect(page).toHaveURL(/#duvidas$/);
  await expect(
    page.getByRole('button', { name: 'Abrir menu' }),
  ).toHaveAttribute('aria-expanded', 'false');
  await page
    .getByText('Os vídeos são enviados automaticamente?', { exact: true })
    .click();
  await expect(
    page.getByText(
      'Não. Gravações e exportações de vídeo ficam no próprio aparelho.',
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Criar minha conta', exact: true })
    .click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await expect(page.getByLabel('Nome completo')).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await page.getByRole('link', { name: 'Entrar agora' }).click();
  await expect(
    page.getByLabel('E-mail ou usuário', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para o site' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440])
  test(`landing e conta sem overflow em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mkdir('../../.local/screenshots/refinamento2', { recursive: true });
    for (const [path, name] of [
      ['/', 'landing'],
      ['/entrar', 'login'],
      ['/cadastro', 'cadastro'],
    ]) {
      await page.goto(path!);
      await expect(page.locator('h1')).toHaveCount(1);
      if (path === '/cadastro') await page.getByRole('checkbox').waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (const img of document.images) {
          img.loading = 'eager';
          await img.decode();
        }
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(page.locator('.bottom-nav')).toHaveCount(0);
      if (path === '/')
        await page.screenshot({
          path: `../../.local/screenshots/refinamento2/landing-dobra-${width}.png`,
        });
      await page.screenshot({
        path: `../../.local/screenshots/refinamento2/${name}-${width}.png`,
        fullPage: true,
      });
    }
  });

test('todas as entradas privadas exigem sessão e preservam destino completo', async ({
  page,
}) => {
  for (const path of [
    '/app',
    '/explorar',
    '/explorar/123',
    '/ride?moto=123&rota=456',
    '/comunidade',
    '/comunidade/grupos/convite/123',
    '/comunidade/eventos/123/mapa',
    '/comunidade/u/piloto',
    '/garagem/123/editar',
    '/historico/123/replay#graficos',
    '/perfil',
    '/estatisticas',
    '/tecnico',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/entrar?retorno=${encodeURIComponent(path)}`);
    await expect(page.locator('.app-shell')).toHaveCount(0);
  }
  for (const path of [
    '/api/auth/me',
    '/api/motorcycles',
    '/api/rides',
    '/api/admin/access',
  ])
    expect((await page.request.get(path)).status()).toBe(401);
  await page.goto('/compartilhar/rides/00000000-0000-4000-8000-000000000000');
  await expect(
    page.getByRole('heading', { name: 'Resumo indisponível' }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/entrar/);
});

test('sessão validada abre app, login rejeita retorno externo e sessão expirada retira painel', async ({
  page,
}) => {
  await authenticate(page);
  await page.goto('/entrar?retorno=https%3A%2F%2Fevil.example');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await page.goto('/entrar?retorno=%2Fhistorico%3Fmodo%3Dpasseio');
  await expect(page).toHaveURL(/\/historico\?modo=passeio$/);
  expect((await page.request.get('/api/admin/access')).status()).toBe(403);
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Visão geral', exact: true }),
  ).toHaveCount(0);
  await page.context().clearCookies();
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar\?retorno=%2Fapp$/);
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('restauração aguarda API sem exibir painel; indisponibilidade preserva contexto local sem autorizar', async ({
  page,
}) => {
  await authenticate(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/me', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/app');
  await expect(page.getByRole('status')).toContainText(
    'Verificando sua sessão',
  );
  await expect(page.locator('.app-shell')).toHaveCount(0);
  release();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Conexão indisponível' }),
  ).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await expect(
    page.getByText('Seus registros locais permanecem neste aparelho.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.unroute('**/api/auth/me');
  await page
    .getByRole('button', { name: 'Tentar novamente', exact: true })
    .click();
  await expect(page.locator('.app-shell')).toBeVisible();
});
