import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { prepare, begin, finish } from './ride-fixtures';
import { mockMotion } from './motion-fixtures';
import { openRideSetting } from './ride-settings';

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});
const directory = '../../.local/screenshots/refinamento5';
const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];
async function capture(page: Page, scene: string, all = false) {
  await mkdir(directory, { recursive: true });
  for (const width of all ? widths : [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.locator('html').evaluate((el) => el.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `${directory}/${scene}-${width}.png`,
      fullPage: true,
    });
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `${directory}/${scene}-viewport-${width}.png`,
      });
  }
  await page.setViewportSize({ width: 390, height: 900 });
}
test('Etapa 5: preparo compacto, estados reais, pausa, cinco abas e sessões reutilizadas', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await prepare(page, false);
  await expect(
    page.getByRole('button', { name: 'Iniciar Ride', exact: true }),
  ).toBeDisabled();
  await capture(page, 'sem-moto');
  const me = await (await page.request.get('/api/auth/me')).json();
  const created = await page.request.post('/api/motorcycles', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data: {
      brand: 'Honda',
      model: 'Moto de teste',
      year: 2024,
      displacementCc: 649,
    },
  });
  expect(created.status()).toBe(201);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Iniciar Ride', exact: true }),
  ).toBeEnabled();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const box = await page
      .getByRole('button', { name: 'Iniciar Ride', exact: true })
      .boundingBox();
    expect(box!.y + box!.height).toBeLessThan(780);
  }
  await expect(
    page.getByRole('button', { name: 'Ativar Sensores' }),
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Ativar vídeo e abrir prévia' }),
  ).toBeHidden();
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await capture(page, 'preparacao', true);
  await page.getByRole('button', { name: 'Iniciar Ride', exact: true }).click();
  await expect(page.locator('.preview-state')).toHaveText('Aguardando GPS');
  await expect(page.locator('.ride-status-clock')).toContainText('—');
  await capture(page, 'aguardando-gps');
  await page.evaluate(() => window.__gpsTest.emit({ speed: null }));
  await expect(page.locator('.preview-state')).toHaveText('Em andamento');
  await expect(
    page.getByRole('region', { name: 'Preparação do Ride' }),
  ).toHaveCount(0);
  await expect(page.locator('.gauge-value')).toHaveText('—');
  await page.waitForTimeout(1100);
  await page.evaluate(() =>
    window.__gpsTest.emit({ longitude: -35.7349, speed: 10 }),
  );
  await expect(page.locator('.gauge-value')).toHaveText('36');
  const controls = await page.locator('.ride-active-controls').boundingBox();
  const bottomNav = await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .boundingBox();
  expect(controls!.y + controls!.height).toBeLessThanOrEqual(bottomNav!.y);
  await capture(page, 'gravando-dados-sinteticos', true);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.locator('html').evaluate((el) => el.scrollWidth),
  ).toBeLessThanOrEqual(844);
  await page.screenshot({
    path: `${directory}/gravando-paisagem.png`,
    fullPage: true,
  });
  const nav = page.getByRole('navigation', { name: 'Área Ride' });
  await nav.getByRole('link', { name: 'Sessões', exact: true }).click();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await expect(
    page.getByRole('link', { name: 'Voltar à sessão', exact: true }),
  ).toBeVisible();
  await capture(page, 'sessoes');
  await nav.getByRole('link', { name: 'Painel', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  const active = await page
    .getByText('Tempo de ride', { exact: true })
    .locator('..')
    .textContent();
  await page.waitForTimeout(1100);
  expect(
    await page
      .getByText('Tempo de ride', { exact: true })
      .locator('..')
      .textContent(),
  ).toBe(active);
  await capture(page, 'pausado', true);
  await context.setOffline(true);
  await capture(page, 'offline');
  await context.setOffline(false);
  await finish(page);
  await capture(page, 'resumo-final', true);
  expect(
    await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link')
      .count(),
  ).toBe(5);
  expect(errors).toEqual([]);
});

test('Etapa 5: diagnóstico individual, calibração opcional e telemetria sem inclinação inventada', async ({
  page,
}) => {
  test.setTimeout(60000);
  await mockMotion(page);
  await prepare(page);
  await openRideSetting(page, 'motion');
  const diagnostic = page.getByLabel('Diagnóstico dos sensores');
  await expect(diagnostic).toContainText('Não testado');
  await capture(page, 'diagnostico');
  await page.getByRole('button', { name: 'Ativar Sensores' }).click();
  await page.evaluate(() => window.__motionTest.start());
  await expect(
    diagnostic.getByText('Funcionando', { exact: true }),
  ).toHaveCount(3);
  await openRideSetting(page, 'calibration');
  await capture(page, 'calibracao');
  await page
    .getByLabel('Celular firmemente fixado no suporte indicado')
    .check();
  await page.getByLabel('Confirmo que a moto está parada e vertical').check();
  await page
    .getByRole('button', { name: 'Calibrar sensores', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Recalibrar sensores' }),
  ).toBeEnabled({ timeout: 6000 });
  await begin(page);
  await page.evaluate(() => window.__motionTest.acceleration(9.80665));
  await expect(page.locator('.force-grid .metric-card').first()).toContainText(
    '1.00',
    { timeout: 6000 },
  );
  await expect(page.locator('.lean-grid .metric-card')).toContainText([
    '—',
    '—',
  ]);
  await capture(page, 'g-valido-sintetico');
  await page.waitForTimeout(1100);
  await page.evaluate(() =>
    window.__gpsTest.emit({ longitude: -35.7349, speed: 12 }),
  );
  await page
    .getByRole('navigation', { name: 'Área Ride' })
    .getByRole('link', { name: 'Telemetria', exact: true })
    .click();
  await expect(
    page.getByRole('img', { name: 'Velocidade GPS por tempo da atividade' }),
  ).toBeVisible();
  const sample = page.getByLabel('Consultar amostra de Velocidade GPS');
  await sample.focus();
  await sample.press('End');
  await expect(sample).toHaveValue('1');
  await capture(page, 'telemetria');
});

test('Etapa 5: contexto aprovado, circuito, cronômetro após passagem e pausa inconclusiva', async ({
  page,
}) => {
  test.setTimeout(60000);
  await prepare(page);
  const me = await (await page.request.get('/api/auth/me')).json();
  const coordinates = [
    [-35.735, -9.665],
    [-35.734, -9.665],
    [-35.734, -9.664],
    [-35.735, -9.664],
    [-35.735, -9.665],
  ];
  const response = await page.request.post('/api/circuits', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data: {
      name: 'Circuito sintético Etapa 5',
      description: 'Geometria de teste, não representa local real.',
      city: 'Maceió',
      state: 'AL',
      category: 'Pista',
      source: 'manual',
      durationSeconds: null,
      geometry: { type: 'LineString', coordinates },
      startLine: {
        type: 'LineString',
        coordinates: [
          [-35.7345, -9.6651],
          [-35.7345, -9.6649],
        ],
      },
      direction: -1,
      waypoints: [coordinates[0], coordinates[1]],
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const id = (await response.json()).route.id;
  const require = createRequire(
    new URL('../../api/package.json', import.meta.url),
  );
  const { Pool } =
    require('pg') as typeof import('../../api/node_modules/@types/pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'verify-full'
        ? { rejectUnauthorized: true }
        : false,
  });
  try {
    await pool.query(
      "UPDATE routes SET status='approved',verification='verified' WHERE id=$1",
      [id],
    );
  } finally {
    await pool.end();
  }
  await page.goto(`/ride?percurso=${id}&modo=pista`);
  await expect(
    page.getByRole('region', { name: 'Acompanhamento da rota' }),
  ).toContainText('Circuito sintético Etapa 5');
  await capture(page, 'com-rota');
  await begin(page);
  for (const longitude of [-35.7346, -35.7344]) {
    await page.waitForTimeout(1100);
    await page.evaluate(
      (longitude) =>
        window.__gpsTest.emit({ longitude, speed: 10, accuracy: 3 }),
      longitude,
    );
  }
  await expect(
    page.getByText('Volta atual', { exact: true }).locator('..'),
  ).toContainText('1 ·');
  // Complete a known synthetic square. No real riding or threshold changes.
  for (const [longitude, latitude] of [
    [-35.734, -9.665],
    [-35.734, -9.6647],
    [-35.734, -9.6644],
    [-35.734, -9.664],
    [-35.7344, -9.664],
    [-35.7347, -9.664],
    [-35.735, -9.664],
    [-35.735, -9.6644],
    [-35.735, -9.6647],
    [-35.735, -9.665],
    [-35.7346, -9.665],
    [-35.7344, -9.665],
  ]) {
    await page.waitForTimeout(1100);
    await page.evaluate(
      (point) => window.__gpsTest.emit({ ...point, speed: 10, accuracy: 3 }),
      { longitude: longitude!, latitude: latitude! },
    );
  }
  await expect(
    page.getByText('Última volta', { exact: true }).locator('..'),
  ).not.toContainText('—');
  await page
    .getByRole('navigation', { name: 'Área Ride' })
    .getByRole('link', { name: 'Circuitos', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Voltas do circuito' }),
  ).toContainText('Circuito sintético Etapa 5');
  await capture(page, 'circuitos');
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await page
    .getByRole('navigation', { name: 'Área Ride' })
    .getByRole('link', { name: 'Painel', exact: true })
    .click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Voltas do circuito' }),
  ).toContainText('1 volta(s) inconclusiva(s)');
  await expect(
    page.getByText('Volta atual', { exact: true }).locator('..'),
  ).toContainText('—');
});

test.describe('vídeo nativo com câmera sintética explicitamente identificada', () => {
  test('Etapa 5: biblioteca própria, estúdio, arquivo real e isolamento de conta', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await prepare(page);
    await openRideSetting(page, 'video');
    await page
      .getByRole('button', { name: 'Ativar vídeo e abrir prévia' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Configuração de vídeo' }),
    ).toContainText('Prévia disponível');
    await begin(page);
    await expect(
      page.getByRole('region', { name: 'Configuração de vídeo' }),
    ).toContainText('REC · Gravando');
    await page.waitForTimeout(2300);
    await finish(page);
    await page
      .getByRole('button', { name: 'Salvar atividade', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Atividade salva com sucesso.',
    );
    const nav = page.getByRole('navigation', { name: 'Área Ride' });
    await nav.getByRole('link', { name: 'Vídeos', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir segmentos' }).click();
    await expect(
      page.getByRole('region', { name: 'Vídeos desta atividade' }),
    ).toContainText('Segmento 1 · Finalizado');
    await capture(page, 'biblioteca');
    await nav.getByRole('link', { name: 'Estúdio', exact: true }).click();
    await page.getByRole('button', { name: 'Editar esta gravação' }).click();
    await expect(
      page.getByLabel('Prévia de vídeo com indicadores incorporados'),
    ).toBeVisible();
    await capture(page, 'estudio');
    await page.getByText('Configurar overlay', { exact: true }).click();
    await capture(page, 'estudio-configuracao', true);
    await prepare(page); // A different owner, same IndexedDB.
    await page.goto('/ride/videos');
    await expect(
      page.getByRole('heading', { name: 'Nenhum vídeo neste aparelho' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Abrir segmentos' }),
    ).toHaveCount(0);
  });
});
