import { chooseOption } from './choices';
import { openRideSetting } from './ride-settings';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { authenticate } from './auth-fixtures';
import { mockMapProvider } from './gps-fixtures';

test.beforeEach(async ({ page }) => {
  await mockMapProvider(page);
  await authenticate(page);
});

const routes = [
  { path: '/app', name: 'inicio' },
  { path: '/explorar', name: 'explorar' },
  { path: '/ride', name: 'ride' },
  { path: '/comunidade', name: 'comunidade' },
  { path: '/garagem', name: 'garagem' },
];

test('Início não apresenta medições fictícias como telemetria', async ({
  page,
}) => {
  await page.goto('/app');
  await expect(
    page.getByRole('region', { name: 'Status do sistema' }),
  ).toBeVisible();
  await expect(page.locator('.home-status')).toContainText('Não iniciado');
  await expect(page.locator('.home-status')).toContainText('Não configurados');
  await expect(
    page.locator('.home-telemetry, .home-map, .speedometer'),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link'),
  ).toHaveCount(5);
});

for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
  test(`páginas sem overflow ou erros em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !/401 \(Unauthorized\)/.test(message.text())
      )
        errors.push(message.text());
    });
    const external: string[] = [];
    page.on('request', (request) => {
      if (
        !new URL(request.url()).hostname.match(
          /^(127\.0\.0\.1|localhost|tiles\.openfreemap\.org)$/,
        )
      )
        external.push(request.url());
    });
    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator('h1')).toHaveCount(1);
      if (route.name === 'explorar')
        await expect(
          page.getByText('Carregando percursos…', { exact: true }),
        ).toHaveCount(0);
      await expect(
        page.getByText('Pré-lançamento · homologação pendente'),
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Navegação principal' }),
      ).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.images).map((image) =>
            // A preparação de sensores pode deixar imagens lazy fora da tela.
            // O teste de captura completa precisa carregá-las explicitamente.
            {
              image.loading = 'eager';
              return image.decode().catch(() => {});
            },
          ),
        );
      });
      const overflow = await page.evaluate(() =>
        Array.from(document.querySelectorAll('body *'))
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.width > 0 &&
              getComputedStyle(el).position !== 'absolute' &&
              (rect.right > innerWidth + 1 || rect.left < -1)
            );
          })
          .map((el) => ({ element: el.tagName, class: el.className })),
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        JSON.stringify(overflow),
      ).toBeLessThanOrEqual(width);
      expect(
        await page
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) => (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      ).toBe(true);
      {
        await mkdir('../../.local/screenshots/refinamento2', {
          recursive: true,
        });
        await page.screenshot({
          path: `../../.local/screenshots/refinamento2/${route.name}-${width}.png`,
          fullPage: true,
        });
      }
      if (route.name === 'comunidade') {
        expect(
          await page
            .locator('.profile-bio')
            .evaluate((element) => element.getBoundingClientRect().width),
        ).toBeGreaterThan(width < 520 ? width * 0.4 : 200);
      }
    }
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}

test('navegação, histórico e acesso pelo avatar sem recarregar documento', async ({
  page,
}) => {
  await page.goto('/app');
  await page.evaluate(() => {
    (window as Window & { navigationMarker?: string }).navigationMarker = 'spa';
  });
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  for (const [name, path] of [
    ['Explorar', '/explorar'],
    ['Ride', '/ride'],
    ['Comunidade', '/comunidade'],
    ['Garagem', '/garagem'],
    ['Início', '/app'],
  ] as const) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      await page.evaluate(
        () =>
          (window as Window & { navigationMarker?: string }).navigationMarker,
      ),
    ).toBe('spa');
  }
  await page
    .getByRole('link', { name: 'Abrir perfil de Piloto de teste' })
    .click();
  await expect(page).toHaveURL(/\/perfil$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
});

test('Explorar consulta dados reais, preserva filtros e não solicita GPS', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition = () => {
        throw new Error('GPS automático');
      };
  });
  await page.goto('/explorar');
  await page.getByRole('searchbox').fill('não existe');
  await expect(
    page.getByText('Nenhuma rota encontrada', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Circuitos', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rotas', exact: true }).click();
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await expect(page.getByLabel('Cidade', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Filtros', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('region', { name: 'Mapa de percursos cadastrados' }),
  ).toBeVisible();
});
test('Ride não solicita hardware automaticamente e não confirma gravação ou sessão salva', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new Error('Acesso a hardware proibido nesta etapa');
    };
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition = blocked;
    if (navigator.geolocation) navigator.geolocation.watchPosition = blocked;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = blocked;
  });
  await page.goto('/ride');
  await expect(
    page.getByRole('heading', { name: 'PREPARE SEU RIDE' }),
  ).toBeVisible();
  await expect(page.getByText('GPS', { exact: false }).last()).toContainText(
    'GPS',
  );
  await expect(
    page.getByRole('button', { name: 'Finalizar', exact: true }),
  ).toHaveCount(0);
  await openRideSetting(page, 'video');
  await expect(
    page.getByRole('button', { name: 'Ativar vídeo e abrir prévia' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', {
      name: 'Iniciar Ride',
    }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ativar GPS' })).toBeVisible();
  await expect(page.locator('.gauge-value')).toHaveText('—');
  await chooseOption(page, 'Modo de pilotagem', 'passeio');
  await expect(
    page.getByRole('heading', { name: 'PREPARE SEU RIDE' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'PREPARE SEU RIDE' }),
  ).toBeVisible();
  await expect(
    page.getByText('Sem gravação ativa', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Iniciar Ride', exact: true }),
  ).toBeDisabled();
});

test('Comunidade autenticada usa dados reais e mantém acesso a grupos', async ({
  page,
}) => {
  await page.goto('/comunidade');
  await expect(
    page.getByText('Nenhuma publicação por aqui ainda.'),
  ).toBeVisible();
  await expect(page.locator('article.post')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Seguindo', exact: true }),
  ).toBeEnabled();
  const groups = page.getByRole('link', { name: 'Grupos', exact: true });
  await expect(groups).toHaveAttribute('href', '/comunidade/grupos');
  await groups.click();
  await expect(
    page.getByRole('heading', { name: 'GRUPOS', exact: true }),
  ).toBeVisible();
});
