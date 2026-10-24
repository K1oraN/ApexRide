import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { authenticate } from './auth-fixtures';
import { mockGps } from './gps-fixtures';
import { begin, prepare } from './ride-fixtures';

const directory = '../../.local/screenshots/refinamento3';
const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];
async function capture(page: Page, name: string, width = 390) {
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
  await page.screenshot({
    path: `${directory}/${name}-${width}.png`,
    fullPage: true,
  });
}
async function headers(page: Page) {
  const session = await (await page.request.get('/api/auth/me')).json();
  return { 'X-Apex-Request': '1', 'X-CSRF-Token': session.csrfToken };
}
async function seedRide(page: Page, bike: string, startedAt: number) {
  const reply = await page.request.post('/api/rides', {
    headers: await headers(page),
    data: {
      clientId: randomUUID(),
      motorcycleId: bike,
      mode: 'passeio',
      visibility: 'private',
      startedAt,
      endedAt: startedAt + 80_000,
      intervals: [{ start: startedAt, end: startedAt + 80_000 }],
      points: Array.from({ length: 16 }, (_, index) => ({
        longitude: -35.735 + index * 0.0001,
        latitude: -9.665,
        timestamp: startedAt + index * 5_000,
        accuracy: 5,
        speed: 2.2,
        heading: 90,
        altitude: null,
        segment: 0,
      })),
    },
  });
  expect(reply.status()).toBe(201);
  return (await reply.json()).id as string;
}

test('nova conta: dashboard real, sem captura automática e oito larguras', async ({
  page,
}) => {
  await authenticate(page);
  await mockGps(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => {
        throw new Error('Câmera automática na Home');
      },
    });
  });
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/app');
  if (process.env.E2E_WEB_MODE === 'development') {
    const module = await page.request.get('/src/history/LastRide.tsx');
    expect(module.ok()).toBe(true);
    expect(await module.text()).toMatch(
      /\bexport\s*(?:\{[^}]*\bLastRide\b|function\s+LastRide\b)/,
    );
  }
  await expect(page.locator('.home-banner')).toContainText('BEM-VINDO, Piloto');
  await expect(page.locator('.home-motorcycle')).toContainText(
    'Adicione sua primeira moto',
  );
  await expect(page.locator('.home-performance')).toContainText('0 sessões');
  await expect(page.locator('.home-recent')).toContainText(
    'Você ainda não registrou um Ride.',
  );
  await expect(page.locator('.home-status')).toContainText('Não configurados');
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link'),
  ).toHaveCount(5);
  await expect(
    page.locator('.speedometer, .illustrative-map, .notification-dot'),
  ).toHaveCount(0);
  for (const width of widths) await capture(page, 'inicio-vazio', width);
  expect(
    requests.some((url) =>
      /maplibre|mapConfig|\/api\/rides\/[^/?]+\/(?:track|telemetry)/.test(url),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
  await page
    .getByRole('link', { name: 'Encontrar rotas', exact: true })
    .click();
  await expect(page).toHaveURL(/\/explorar$/);
  await page.goto('/app');
  await page.getByRole('link', { name: 'Preparar Ride', exact: true }).click();
  await expect(page).toHaveURL(/\/ride$/);
});

test('moto principal, estatísticas por período, XP e duas atividades pelas APIs reais', async ({
  page,
}) => {
  test.setTimeout(90000);
  const bikes = await prepare(page);
  const photo = await page.request.post(`/api/motorcycles/${bikes[0]}/photo`, {
    headers: { ...(await headers(page)), 'Content-Type': 'image/webp' },
    data: await readFile('public/assets/garage-bike.webp'),
  });
  expect(photo.status()).toBe(200);
  await page.goto('/app');
  await expect(page.locator('.home-bike-card')).toContainText('CB 650R');
  await expect(page.locator('.home-recent')).toContainText(
    'Você ainda não registrou um Ride.',
  );
  await capture(page, 'inicio-com-moto');
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12);
  const first = await seedRide(page, bikes[0]!, now.getTime() - 300_000);
  await seedRide(page, bikes[1]!, previousMonth.getTime());
  await seedRide(
    page,
    bikes[0]!,
    new Date(now.getFullYear() - 1, 5, 15, 12).getTime(),
  );
  await page.goto('/app');
  await expect(page.locator('.home-performance')).toContainText('1 sessões');
  await expect(page.locator('.home-recent-card')).toHaveCount(2);
  await expect(page.locator('.home-recent-card').first()).toHaveAttribute(
    'href',
    `/historico/${first}`,
  );
  const statsReply = page.waitForResponse(
    (response) =>
      response.url().includes('/api/rides/stats?') &&
      !new URL(response.url()).searchParams.has('from'),
  );
  await page.getByLabel('Período do desempenho').selectOption('total');
  const totals = (await (await statsReply).json()).totals;
  await expect(page.locator('.home-performance')).toContainText('3 sessões');
  await expect(
    page.locator('.home-performance-grid > *').first(),
  ).toContainText(
    (totals.distance_meters / 1000).toLocaleString('pt-BR', {
      maximumFractionDigits: 1,
    }),
  );
  const progression = await (
    await page.request.get('/api/gamification/me')
  ).json();
  const achievements = await (
    await page.request.get('/api/gamification/me/achievements')
  ).json();
  await expect(page.locator('.home-progress')).toContainText(
    `Nível ${progression.progress.level}`,
  );
  const missions = await (
    await page.request.get('/api/gamification/me/challenges')
  ).json();
  await expect(
    page.locator('.home-performance-grid').getByRole('link').first(),
  ).toContainText(
    String(
      missions.items.filter(
        (item: { status: string }) => item.status === 'active',
      ).length,
    ),
  );
  await expect(
    page.locator('.home-performance-grid').getByRole('link').first(),
  ).toHaveAttribute('href', '/perfil/conquistas#missoes');
  await expect(
    page.locator('.home-performance-grid').getByRole('link').last(),
  ).toContainText(
    String(
      achievements.items.filter(
        (item: { status: string }) => item.status === 'unlocked',
      ).length,
    ),
  );
  await page.getByLabel('Período do desempenho').selectOption('year');
  await expect(page.locator('.home-performance')).toContainText(
    `${1 + Number(previousMonth.getFullYear() === now.getFullYear())} sessões`,
  );
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  await page.getByLabel('Período do desempenho').selectOption('30');
  await expect(page.locator('.home-performance')).toContainText(
    `${1 + Number(previousMonth.getTime() >= cutoff.getTime())} sessões`,
  );
  for (const width of widths)
    await capture(page, 'inicio-com-atividades', width);
  await page.locator('.home-recent-card').first().click();
  await expect(page).toHaveURL(`/historico/${first}`);
  await page.goto('/app');
  await page.getByRole('link', { name: 'Ver todas as atividades' }).click();
  await expect(page).toHaveURL(/\/historico$/);
});

test('Ride ativo e pausado preservados ao voltar à Home, sem outro controlador', async ({
  page,
}) => {
  await prepare(page);
  await begin(page);
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Início', exact: true })
    .click();
  await expect(page.locator('.home-quick-ride')).toContainText(
    'Ride em andamento',
  );
  await expect(page.locator('.home-status')).toContainText('Capturando');
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await capture(page, 'inicio-ride-ativo');
  await page.getByRole('link', { name: 'Voltar ao Ride', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Início', exact: true })
    .click();
  await expect(page.locator('.home-quick-ride')).toContainText('Ride pausado');
  await expect(page.locator('.ride-nav')).toHaveAttribute(
    'data-ride-state',
    'paused',
  );
  await capture(page, 'inicio-ride-pausado');
});

test('falhas parciais têm retry, sem trocar estatísticas indisponíveis por zero', async ({
  page,
}) => {
  await prepare(page);
  await page.route('**/api/rides/stats?**', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Indisponibilidade de teste' },
    }),
  );
  await page.route('**/api/rides?limit=2', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Indisponibilidade de teste' },
    }),
  );
  await page.goto('/app');
  await expect(page.locator('.home-performance')).toContainText(
    'Desempenho indisponível',
  );
  await expect(
    page.locator('.home-performance-grid > *').first(),
  ).toContainText('—');
  await expect(page.locator('.home-recent')).toContainText(
    'Histórico remoto indisponível',
  );
  await expect(page.locator('.home-motorcycle')).toContainText('CB 650R');
  await capture(page, 'inicio-falha-parcial');
  await page.unroute('**/api/rides/stats?**');
  await page.unroute('**/api/rides?limit=2');
  await page
    .locator('.home-performance')
    .getByRole('button', { name: 'Tentar novamente' })
    .click();
  await page
    .locator('.home-recent')
    .getByRole('button', { name: 'Tentar novamente' })
    .click();
  await expect(page.locator('.home-performance')).toContainText('0 sessões');
  await expect(page.locator('.home-recent')).toContainText(
    'Você ainda não registrou um Ride.',
  );
});

test('offline mantém cópia local, identifica revisão e isola outra conta', async ({
  page,
  context,
}) => {
  await prepare(page);
  await begin(page);
  await page.evaluate(() =>
    window.__gpsTest.emit({ longitude: -35.7349 }, Date.now() + 1000),
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Resumo da atividade' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Início', exact: true })
    .click();
  await expect(page.locator('.home-status')).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator('.home-status')).toContainText('Sem conexão');
  await expect(page.locator('.home-performance')).toContainText('Sem conexão');
  await expect(page.locator('.home-recent-card')).toHaveCount(1);
  await expect(page.locator('.home-recent')).toContainText(
    'Aguardando revisão',
  );
  await expect(page.locator('.home-recent')).toContainText(
    'somente cópias desta conta',
  );
  await capture(page, 'inicio-offline');
  await context.setOffline(false);
  await page.request.post('/api/auth/logout', {
    headers: await headers(page),
    data: {},
  });
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar/);
  await prepare(page, false);
  await page.goto('/app');
  await expect(page.locator('.home-motorcycle')).toContainText(
    'Adicione sua primeira moto',
  );
  await expect(page.locator('.home-recent')).toContainText(
    'Você ainda não registrou um Ride.',
  );
  await expect(page.locator('.home-quick-ride')).not.toContainText(
    'Ride em andamento',
  );
  await expect(page.locator('.home-recent-card')).toHaveCount(0);
});
