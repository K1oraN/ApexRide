import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepare, begin, finish } from './ride-fixtures';

test('Parte 10: perda de internet, pausa, finalização, recarga offline, nova sessão e confirmação real', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await prepare(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await begin(page);
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
  await context.setOffline(true);
  await page.unroute('https://tiles.openfreemap.org/**');
  const panel = page.getByRole('region', {
    name: 'Armazenamento e sincronização',
  });
  await expect(panel).toContainText('Offline');
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(page.locator('.preview-state')).toHaveText('Pausado');
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.734 }));
  await finish(page);
  await expect(
    page.getByText(/3 pontos GPS aceitos · 2 segmentos/),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: /^Atividade salva/ }),
  ).toContainText('Atividade salva no aparelho');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Iniciar Ride', exact: true }),
  ).toBeEnabled();
  await panel.locator('summary').click();
  await expect(panel).toContainText('1 pendentes');
  await panel.getByRole('button', { name: 'Revisar resumo local' }).click();
  await expect(
    page.getByRole('img', { name: 'Traçado GPS local sem base cartográfica' }),
  ).toBeVisible();
  await expect(
    page.getByText(/3 pontos GPS aceitos · 2 segmentos/),
  ).toBeVisible();
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await mkdir('../../.local/screenshots', { recursive: true });
    await page.screenshot({
      path: `../../.local/screenshots/offline-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Preparar novo Ride' }).click();
  await begin(page);
  await page.waitForTimeout(50);
  await finish(page);
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Descartar atividade', exact: true })
    .click();
  await context.setOffline(false);
  await expect(panel).toContainText('Online');
  await expect(panel).toContainText('Sincronizado', { timeout: 15000 });
  const rows = (await (await page.request.get('/api/rides')).json()).rides;
  expect(rows).toHaveLength(1);
  expect(
    (await (await page.request.get(`/api/rides/${rows[0].id}`)).json()).points,
  ).toHaveLength(3);
  const keys = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(
      names.map(async (name) =>
        (await (await caches.open(name)).keys()).map((r) => r.url),
      ),
    );
    return requests.flat();
  });
  expect(keys.length).toBeGreaterThan(10);
  expect(
    keys.some((k) => k.includes('/api/') || k.includes('openfreemap')),
  ).toBe(false);
});

test('Parte 10: recarregamento identifica sessão interrompida e recupera somente pontos persistidos', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await prepare(page);
  await begin(page);
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
  const panel = page.getByRole('region', {
    name: 'Armazenamento e sincronização',
  });
  await page.waitForTimeout(2200);
  await expect(panel).toContainText('Salvo no aparelho');
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await panel.locator('summary').click();
  await expect(panel).toContainText(
    'Sessão interrompida ou aberta em outra aba',
  );
  await page.waitForTimeout(15500);
  await panel.getByRole('button', { name: 'Revisar resumo local' }).click();
  await expect(
    page.getByRole('region', { name: 'Resumo da atividade' }),
  ).toBeVisible();
  await expect(
    page.getByText(/2 pontos GPS aceitos · 1 segmentos/),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'Sessão interrompida recuperada',
  );
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: /^Atividade salva/ }),
  ).toContainText('Atividade salva com sucesso.');
  const rows = (await (await page.request.get('/api/rides')).json()).rides;
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].active_ms)).toBeLessThan(10000);
});

test('Parte 10: backend indisponível mantém fila e permite repetir sem perder a atividade', async ({
  page,
}) => {
  await prepare(page);
  await begin(page);
  await page.waitForTimeout(50);
  await finish(page);
  await page.route('**/api/health', (route) =>
    route.fulfill({ status: 503, json: { status: 'error' } }),
  );
  await page.route('**/api/rides', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: { message: 'Servidor de teste indisponível' },
        })
      : route.continue(),
  );
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: /^Atividade salva/ }),
  ).toContainText('Atividade salva no aparelho');
  const panel = page.getByRole('region', {
    name: 'Armazenamento e sincronização',
  });
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(panel).toContainText('Servidor indisponível');
  expect(
    (await (await page.request.get('/api/rides')).json()).rides,
  ).toHaveLength(0);
  await page.unroute('**/api/health');
  await page.unroute('**/api/rides');
  await panel.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /^Atividade salva/ }),
  ).toContainText('Atividade salva com sucesso.');
  expect(
    (await (await page.request.get('/api/rides')).json()).rides,
  ).toHaveLength(1);
});
