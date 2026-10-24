import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mockMapProvider } from './gps-fixtures';

test.beforeEach(async ({ page }) => {
  await mockMapProvider(page);
});

const routes = [
  { path: '/', name: 'inicio' },
  { path: '/explorar', name: 'explorar' },
  { path: '/ride', name: 'ride' },
  { path: '/comunidade', name: 'comunidade' },
  { path: '/garagem', name: 'garagem' },
];

test('Início não apresenta medições fictícias como telemetria', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('img', { name: 'Velocidade GPS indisponível' }),
  ).toBeVisible();
  await expect(page.locator('.home-telemetry')).toContainText('INICIE UM RIDE');
  await expect(page.locator('.home-telemetry')).toContainText('Indisponível');
  await expect(page.locator('.home-map')).toContainText('MAPA ILUSTRATIVO');
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link'),
  ).toHaveCount(5);
});

for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
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
      if (route.name === 'explorar')
        await expect(
          page.getByText('Carregando percursos…', { exact: true }),
        ).toHaveCount(0);
      await expect(page.locator('h1')).toHaveCount(1);
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
      if (route.name !== 'garagem') {
        await mkdir('../../.local/screenshots', { recursive: true });
        await page.screenshot({
          path: `../../.local/screenshots/${route.name}-${width}.png`,
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
  await page.goto('/');
  await page.evaluate(() => {
    (window as Window & { navigationMarker?: string }).navigationMarker = 'spa';
  });
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  for (const [name, path] of [
    ['Explorar', '/explorar'],
    ['Ride', '/ride'],
    ['Comunidade', '/comunidade'],
    ['Garagem', '/garagem'],
    ['Início', '/'],
  ] as const) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`${path === '/' ? '/$' : path + '$'}`),
    );
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
  await page.getByRole('link', { name: 'Entrar na sua conta' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
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
  await page.getByRole('button', { name: 'Ao vivo', exact: true }).click();
  await expect(
    page.getByText('Nenhuma transmissão ativa', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Filtrar rotas', exact: true })
    .click();
  await expect(page.getByLabel('Cidade', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Filtrar rotas', exact: true }),
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
  await expect(page.getByRole('heading', { name: 'MODO MISTO' })).toBeVisible();
  await expect(page.getByText('GPS', { exact: false }).last()).toContainText(
    'GPS',
  );
  await expect(
    page.getByRole('button', { name: 'Finalizar', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Ativar vídeo e abrir prévia' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: 'Iniciar Ride',
    }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ativar GPS' })).toBeVisible();
  await expect(page.locator('.gauge-value')).toHaveText('—');
  await page
    .getByLabel('Modo de pilotagem', { exact: true })
    .selectOption('passeio');
  await expect(
    page.getByRole('heading', { name: 'MODO PASSEIO' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'MODO PASSEIO' }),
  ).toBeVisible();
  await expect(page.locator('.preview-state')).toHaveText('Sem gravação ativa');
});

test('Comunidade vazia usa dados reais e exige login para interagir', async ({
  page,
}) => {
  await page.goto('/comunidade');
  await expect(
    page.getByRole('link', { name: 'Entrar na conta', exact: true }),
  ).toHaveAttribute('href', '/entrar');
  await expect(
    page.getByText('Nenhuma publicação por aqui ainda.'),
  ).toBeVisible();
  await expect(page.locator('article.post')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Seguindo', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('link', { name: 'Entre para participar', exact: true }),
  ).toHaveAttribute('href', '/entrar');
  const groups = page.getByRole('link', { name: 'Grupos', exact: true });
  await expect(groups).toHaveAttribute('href', '/comunidade/grupos');
  await groups.click();
  await expect(
    page.getByRole('heading', { name: 'GRUPOS', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Nenhum grupo encontrado. Ajuste os filtros ou crie uma comunidade.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Entre para participar ou criar grupos',
      exact: true,
    }),
  ).toHaveAttribute('href', '/entrar');
});
