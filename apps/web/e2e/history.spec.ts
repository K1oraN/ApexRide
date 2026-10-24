import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { prepare, begin, finish } from './ride-fixtures';
async function session(page: Page) {
  return (await page.request.get('/api/auth/me')).json();
}
async function seed(page: Page, bike: string, index = 0, mode = 'misto') {
  const me = await session(page),
    start = Date.now() - 86400000 * (index + 1);
  const body = {
    clientId: randomUUID(),
    motorcycleId: bike,
    mode,
    visibility: 'public',
    startedAt: start,
    endedAt: start + (index + 10) * 1000,
    intervals: [{ start, end: start + (index + 10) * 1000 }],
    points: Array.from({ length: 7 }, (_, i) => ({
      longitude: -35.735 + i * 0.0001,
      latitude: -9.665 + (i > 3 ? 0.0001 : 0),
      timestamp: start + i * 1000,
      accuracy: 5,
      speed: 10,
      heading: 90,
      altitude: null,
      segment: i > 3 ? 1 : 0,
    })),
  };
  const response = await page.request.post('/api/rides', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data: body,
  });
  expect(response.status()).toBe(201);
  return { id: (await response.json()).id as string, body };
}
test('Parte 12: histórico, filtros combinados, paginação, perfil e último Ride reais', async ({
  page,
}) => {
  test.setTimeout(60000);
  const bikes = await prepare(page);
  const latest = await seed(page, bikes[0]!, 0, 'passeio');
  for (let i = 1; i < 14; i++)
    await seed(page, bikes[i % 2]!, i, i % 2 ? 'pista' : 'passeio');
  await page.goto('/historico');
  await expect(
    page.getByText('14 atividade(s) salva(s) na conta', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label="Histórico sincronizado"] article'),
  ).toHaveCount(12);
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(
    page.locator('[aria-label="Histórico sincronizado"] article'),
  ).toHaveCount(2);
  await page.getByText('Filtros de atividades', { exact: true }).click();
  await page.getByLabel('Modo', { exact: true }).selectOption('pista');
  await expect(
    page.locator('[aria-label="Histórico sincronizado"] article'),
  ).toHaveCount(7);
  await page.getByLabel('Motocicleta', { exact: true }).selectOption(bikes[0]!);
  await expect(
    page.getByRole('heading', {
      name: 'Nenhuma atividade encontrada',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Limpar filtros', exact: true })
    .click();
  await expect(
    page.locator('[aria-label="Histórico sincronizado"] article'),
  ).toHaveCount(12);
  await page.goto('/');
  const last = page.locator('.last-ride');
  await expect(last).toContainText('Passeio —');
  await expect(last).toHaveAttribute('href', '/historico/' + latest.id);
  await page.goto('/perfil');
  await expect(page.getByText('Rides salvos', { exact: true })).toBeVisible();
  await expect(
    page.locator('.profile-stats .metric-card').first(),
  ).toContainText('14');
  await page
    .getByRole('link', { name: 'Ver todas as atividades', exact: true })
    .click();
  await expect(page).toHaveURL(/\/historico$/);
});

test('Parte 12: detalhes, gráficos, edição, compartilhamento seguro e exclusão', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const bikes = await prepare(page),
    saved = await seed(page, bikes[0]!);
  const me = await session(page);
  await page.goto('/historico/' + saved.id);
  await expect(
    page.getByRole('heading', { name: 'Resumo', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Trajeto salvo' }),
  ).toContainText('2 segmento(s)');
  await page
    .getByRole('button', { name: 'Carregar gráficos e eventos', exact: true })
    .click();
  await expect(
    page.getByRole('img', { name: 'Velocidade GPS por tempo da atividade' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Consultar amostra de Velocidade GPS', { exact: true }),
  ).toBeVisible();
  await page
    .getByText('Editar título, descrição e visibilidade', { exact: true })
    .click();
  await page
    .getByLabel('Título', { exact: true })
    .fill('Minha casa -9.665 -35.735');
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Endereço residencial particular');
  await page
    .getByRole('button', { name: 'Salvar alterações', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Minha casa -9.665 -35.735',
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copiedRideLink?: string }).copiedRideLink =
            text;
        },
      },
    }),
  );
  await page
    .getByRole('button', { name: 'Copiar link público', exact: true })
    .click();
  await expect(
    page.getByText('Link público copiado.', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { copiedRideLink?: string }).copiedRideLink,
    ),
  ).toBe(`http://127.0.0.1:5174/compartilhar/rides/${saved.id}`);
  const context = await browser.newContext(),
    visitor = await context.newPage();
  await visitor.goto('/compartilhar/rides/' + saved.id);
  await expect(visitor.getByRole('heading', { name: /Misto —/ })).toBeVisible();
  await expect(visitor.locator('body')).not.toContainText('Minha casa');
  await expect(visitor.locator('body')).not.toContainText(
    'Endereço residencial',
  );
  await expect(visitor.locator('body')).not.toContainText('-35.735');
  expect((await visitor.request.get('/api/rides/' + saved.id)).status()).toBe(
    401,
  );
  await page
    .getByText('Editar título, descrição e visibilidade', { exact: true })
    .click();
  await page
    .getByLabel('Visibilidade da atividade salva', { exact: true })
    .selectOption('private');
  await page
    .getByRole('button', { name: 'Salvar alterações', exact: true })
    .click();
  await expect(page.getByText(/Modo misto · Privada/)).toBeVisible();
  await visitor.reload();
  await expect(
    visitor.getByRole('heading', { name: 'Resumo indisponível', exact: true }),
  ).toBeVisible();
  await page
    .getByText('Editar título, descrição e visibilidade', { exact: true })
    .click();
  await page
    .getByLabel('Visibilidade da atividade salva', { exact: true })
    .selectOption('public');
  await page
    .getByRole('button', { name: 'Salvar alterações', exact: true })
    .click();
  await expect(page.getByText(/Modo misto · Pública/)).toBeVisible();
  await page.request.patch('/api/users/me/privacy', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data: { profileVisibility: 'private' },
  });
  await visitor.reload();
  await expect(
    visitor.getByRole('heading', { name: 'Resumo indisponível', exact: true }),
  ).toBeVisible();
  await context.close();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Excluir atividade', exact: true })
    .click();
  await expect(page).toHaveURL(/\/historico$/);
  await expect(
    page.getByText('0 atividade(s) salva(s) na conta', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.post('/api/rides', {
        headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
        data: saved.body,
      })
    ).status(),
  ).toBe(410);
});

test('Parte 12: histórico local offline, detalhes e reconciliação sem duplicações', async ({
  page,
}) => {
  test.setTimeout(60000);
  await prepare(page);
  await begin(page);
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
  await page.context().setOffline(true);
  await finish(page);
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(page.getByText(/Estado: Salvo no aparelho/)).toBeVisible();
  await page
    .getByRole('link', { name: 'Abrir atividade no histórico', exact: true })
    .click();
  await expect(
    page.getByText('CÓPIA DESTE APARELHO', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Carregar gráficos locais', exact: true })
    .click();
  await expect(
    page.getByRole('img', { name: 'Velocidade GPS por tempo da atividade' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Voltar ao histórico', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Histórico no aparelho' })
      .getByRole('article'),
  ).toHaveCount(1);
  await page.context().setOffline(false);
  await page
    .getByRole('button', { name: 'Sincronizar agora', exact: true })
    .click();
  await expect(
    page.locator('[aria-label="Histórico sincronizado"] article'),
  ).toHaveCount(1, { timeout: 20000 });
  await expect(
    page
      .getByRole('region', { name: 'Histórico no aparelho' })
      .getByRole('article'),
  ).toHaveCount(0);
  const list = await (await page.request.get('/api/rides')).json();
  expect(list.total).toBe(1);
});

test('Parte 12: histórico, detalhes e estatísticas responsivos em seis larguras', async ({
  page,
}) => {
  test.setTimeout(90000);
  const bikes = await prepare(page),
    saved = await seed(page, bikes[0]!);
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 360, 375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, label] of [
      ['/historico', 'history'],
      ['/historico/' + saved.id, 'history-detail'],
      ['/estatisticas', 'history-stats'],
    ] as const) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      if (label === 'history')
        await expect(
          page.locator('[aria-label="Histórico sincronizado"] article'),
        ).toHaveCount(1);
      if (label === 'history-detail') {
        await expect(
          page.getByRole('heading', { name: 'Resumo', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText('Carregando mapa…', { exact: true }),
        ).toHaveCount(0);
        await page
          .getByRole('button', {
            name: 'Carregar gráficos e eventos',
            exact: true,
          })
          .click();
        await expect(
          page.getByRole('img', {
            name: 'Velocidade GPS por tempo da atividade',
          }),
        ).toBeVisible();
      }
      if (label === 'history-stats')
        await expect(
          page.getByRole('heading', { name: 'Evolução mensal', exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        label + ' ' + width,
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: `../../.local/screenshots/${label}-${width}.png`,
        fullPage: true,
      });
    }
  }
});
