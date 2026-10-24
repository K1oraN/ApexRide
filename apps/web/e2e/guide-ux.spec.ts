import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepare } from './ride-fixtures';
import { openRideSetting } from './ride-settings';

const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];
async function capture(page: Page, name: string) {
  const directory = '../../.local/screenshots/refinamento5-ajustes';
  await mkdir(directory, { recursive: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.locator('html').evaluate((el) => el.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `${directory}/${name}-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 900 });
}

test('Guia centraliza instruções, início e Explorar ficam limpos, paginação alinhada', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page);
  await page.goto('/app');
  await expect(
    page.getByText('Novas histórias, novas conexões.', { exact: true }),
  ).toHaveCount(0);
  await page.goto('/explorar');
  await expect(
    page.getByText('Descobertas de trajetos semelhantes', { exact: true }),
  ).toHaveCount(0);
  const pagination = page.getByRole('navigation', {
    name: 'Páginas de percursos',
  });
  await expect(pagination).toBeVisible();
  const previous = await pagination
    .getByRole('button', { name: 'Anterior', exact: true })
    .boundingBox();
  const next = await pagination
    .getByRole('button', { name: 'Próxima', exact: true })
    .boundingBox();
  expect(Math.abs(previous!.y - next!.y)).toBeLessThan(2);
  await capture(page, 'explorar');
  await page.goto('/explorar/navegar');
  await expect(
    page.getByText(
      'Planeje com a moto parada. Navegar não inicia gravação, XP ou compartilhamento.',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText('Busca de endereços indisponível', { exact: true }),
  ).toBeVisible();
  await capture(page, 'planejar-navegacao');
  await page.getByRole('button', { name: 'Mais opções', exact: true }).click();
  await page
    .locator('header.app-header')
    .getByRole('link', { name: 'Guia', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'GUIA DO PILOTO' }),
  ).toBeVisible();
  await capture(page, 'guia');
  await page
    .getByRole('searchbox', { name: 'Pesquisar no Guia' })
    .fill('âncoras');
  await expect(page.locator('.guide-topic')).toHaveCount(1);
  await expect(
    page.getByText(/Importação externa ainda indisponível/),
  ).toBeVisible();
  await capture(page, 'guia-pesquisa');
  await page.goto('/guia#offline');
  await expect(page.locator('#offline')).toHaveAttribute('open');
  await expect
    .poll(async () => (await page.locator('#offline').boundingBox())!.y)
    .toBeLessThan(400);
  expect(
    await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link')
      .count(),
  ).toBe(5);
  expect(errors).toEqual([]);
});

test('Ride sem rolagem lateral, seleção GPS moderna, sessões e busca de arquivos', async ({
  page,
}) => {
  test.setTimeout(90000);
  await prepare(page);
  const navigation = page.getByRole('navigation', { name: 'Área Ride' });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await navigation.evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(
      await navigation.evaluate((element) => element.clientWidth),
    );
  }
  await expect(
    page.getByText('Sobre medições, privacidade e uso offline', {
      exact: true,
    }),
  ).toHaveCount(0);
  await openRideSetting(page, 'speed');
  await expect(
    page.getByRole('radio', { name: 'GPS Assistido Automático' }),
  ).toBeChecked();
  await page.getByRole('radio', { name: 'GPS Puro', exact: true }).check();
  await expect(
    page.getByRole('radio', { name: 'GPS Puro', exact: true }),
  ).toBeChecked();
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/auth/me')).json()).user.telemetry
          .speedMode,
    )
    .toBe('pure');
  await capture(page, 'gps-escolha');
  await page.route('**/api/users/me/telemetry', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Falha sintética ao salvar preferência.' },
    }),
  );
  await page.getByRole('radio', { name: 'GPS Assistido Automático' }).check();
  await expect(page.getByRole('alert')).toContainText(
    'Falha sintética ao salvar preferência.',
  );
  await expect(
    page.getByRole('radio', { name: 'GPS Puro', exact: true }),
  ).toBeChecked();
  await page.unroute('**/api/users/me/telemetry');
  await openRideSetting(page, 'video');
  await expect(
    page.getByRole('region', { name: 'Vídeo do Ride', exact: true }),
  ).toHaveCount(0);
  await capture(page, 'camera-configuracao');
  await navigation.getByRole('link', { name: 'Sessões', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole('searchbox', { name: 'Pesquisar atividades' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Voltar ao perfil', exact: true }),
  ).toHaveCount(0);
  await page.getByText('Filtros de atividades', { exact: true }).click();
  await capture(page, 'sessoes-filtros');
  await navigation.getByRole('link', { name: 'Vídeos', exact: true }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Pesquisar gravações' }),
  ).toBeVisible();
  await expect(
    page.getByText('Arquivos, sincronização e limites', { exact: true }),
  ).toHaveCount(0);
  await capture(page, 'biblioteca-limpa');
});

test('Menu único, filtros de eventos, paginação e missões reais no desempenho', async ({
  page,
}) => {
  test.setTimeout(120000);
  await prepare(page);
  await expect(
    page.getByText('Sem gravação ativa', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Guia/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mais opções', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Guia', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Configurações', exact: true }),
  ).toBeVisible();
  await capture(page, 'menu-unico');
  await page.getByRole('link', { name: 'Descobertas', exact: true }).click();
  await expect(page).toHaveURL(/\/descobertas$/);
  await expect(
    page.getByText('Descobertas de trajetos semelhantes', { exact: true }),
  ).toBeVisible();
  await page.goto('/guia');
  await expect(
    page.getByText('Descobertas de trajetos semelhantes', { exact: true }),
  ).toHaveCount(0);
  const requests: URL[] = [];
  await page.route('**/api/events?*', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    return route.fulfill({
      json: { items: [], hasMore: url.searchParams.get('page') !== '2' },
    });
  });
  await page.goto('/comunidade/eventos');
  const pagination = page.getByRole('navigation', {
    name: 'Páginas de eventos',
  });
  await expect(
    pagination.getByRole('button', { name: 'Próxima' }),
  ).toBeEnabled();
  await pagination.getByRole('button', { name: 'Próxima' }).click();
  await expect(page).toHaveURL(/page=2/);
  await page
    .getByRole('radiogroup', { name: 'Tipo', exact: true })
    .getByRole('radio', { name: 'Passeios', exact: true })
    .click();
  await expect(
    page
      .getByRole('radiogroup', { name: 'Tipo', exact: true })
      .getByRole('radio', { name: 'Passeios', exact: true }),
  ).toBeChecked();
  await expect
    .poll(() => requests.at(-1)?.searchParams.get('type'))
    .toBe('ride');
  await expect(page).not.toHaveURL(/page=2/);
  await expect(
    page.getByRole('combobox', { name: 'Exibir', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Pesquisar eventos', exact: true })
    .fill('Praia');
  await expect.poll(() => requests.at(-1)?.searchParams.get('q')).toBe('Praia');
  await capture(page, 'eventos-filtros');
  const previous = await pagination
    .getByRole('button', { name: 'Anterior' })
    .boundingBox();
  const next = await pagination
    .getByRole('button', { name: 'Próxima' })
    .boundingBox();
  expect(Math.abs(previous!.y - next!.y)).toBeLessThan(2);
  await page
    .getByRole('button', { name: 'Limpar filtros', exact: true })
    .click();
  await expect(
    page.getByRole('radio', { name: 'Todos', exact: true }),
  ).toBeChecked();
  const session = await (await page.request.get('/api/auth/me')).json();
  expect(
    (
      await page.request.post('/api/gamification/me/challenges', {
        headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': session.csrfToken },
        data: { code: 'first_ride' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/app');
  await expect(
    page.locator('.home-performance-grid').getByRole('link').first(),
  ).toContainText('1 Missões ativas');
  await expect(page.getByLabel('Período do desempenho')).toBeVisible();
  await expect(page.locator('.home-performance-grid')).toContainText(
    'Distância total',
  );
  await expect(page.locator('.home-performance-grid')).toContainText(
    'Tempo de pilotagem',
  );
  await capture(page, 'desempenho-missoes');
});
