import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepare, begin, finish } from './ride-fixtures';
import { telemetryFixture } from '../../api/test/telemetry-fixtures';
import { motionFixture } from '../../api/test/motion-fixtures';
import { analyzeTelemetry } from '@apex-ride/ride-core/telemetry';
async function seed(page: Page, bike: string, empty = false) {
  const me = await (await page.request.get('/api/auth/me')).json();
  const body = telemetryFixture();
  body.motorcycleId = bike;
  body.motion = motionFixture(body.startedAt);
  if (empty) {
    body.points = body.points.slice(0, 1);
    delete body.motion;
  }
  body.telemetry = analyzeTelemetry(body);
  const r = await page.request.post('/api/rides', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data: body,
  });
  expect(r.status()).toBe(201);
  return {
    id: (await r.json()).id as string,
    body,
    csrf: me.csrfToken as string,
  };
}
async function seek(page: Page, time: number) {
  await page
    .getByRole('slider', { name: 'Instante do replay', exact: true })
    .evaluate((node, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(node, String(value));
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }, time);
}
test('Parte 13: saved measurements, play/pause, speeds, seek, chart, events and map exploration', async ({
  page,
}) => {
  test.setTimeout(60000);
  const bikes = await prepare(page),
    saved = await seed(page, bikes[0]!);
  await page.goto(`/historico/${saved.id}`);
  await page
    .getByRole('link', { name: 'Reproduzir Ride', exact: true })
    .click();
  const controls = page.getByRole('region', { name: 'Controles de replay' });
  await expect(controls.getByText('Pronto', { exact: true })).toBeVisible();
  await expect(page.locator('.speed-source')).toHaveText(
    'GPS original registrado',
  );
  await expect(
    page.getByRole('region', { name: 'Telemetria sincronizada' }),
  ).toContainText('1.00');
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Iniciar replay', exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole('slider', { name: 'Instante do replay' })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole('button', { name: 'Pausar replay', exact: true })
    .click();
  const paused = await page
    .getByRole('slider', { name: 'Instante do replay' })
    .inputValue();
  await page.waitForTimeout(500);
  expect(
    await page.getByRole('slider', { name: 'Instante do replay' }).inputValue(),
  ).toBe(paused);
  for (const speed of ['0.5', '1', '2', '4'])
    await page
      .getByLabel('Velocidade do replay', { exact: true })
      .selectOption(speed);
  expect(
    await page.getByRole('slider', { name: 'Instante do replay' }).inputValue(),
  ).toBe(paused);
  await seek(page, 3500);
  await expect(
    page.getByRole('slider', { name: 'Instante do replay' }),
  ).toHaveValue('3500');
  const cursor = page
    .locator('line[aria-label="Instante atual do replay"]')
    .first();
  await expect(cursor).toHaveAttribute(
    'x1',
    String(
      48 + (3500 / (saved.body.intervals[0]!.end - saved.body.startedAt)) * 530,
    ),
  );
  await page
    .getByRole('button', { name: /0–100 · aceleração estimada/ })
    .click();
  await expect(page.getByText(/Em reprodução: 0–100/)).toBeVisible();
  const chart = page.getByRole('img', {
    name: 'Velocidade GPS por tempo da atividade',
  });
  await chart.click({ position: { x: 120, y: 50 } });
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 50,
    box.y + box.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(
    page.getByText('Explorando mapa · acompanhamento suspenso', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Acompanhar motocicleta no replay',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Reiniciar', exact: true }).click();
  await expect(
    page.getByRole('slider', { name: 'Instante do replay' }),
  ).toHaveValue('0');
  await seek(page, saved.body.intervals[0]!.end - saved.body.startedAt);
  await expect(controls.getByText('Concluído', { exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: 'Voltar ao histórico', exact: true })
    .click();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(0);
});
test('Parte 13: replay responsive, keyboard and reduced motion', async ({
  page,
}) => {
  test.setTimeout(90000);
  const bikes = await prepare(page),
    saved = await seed(page, bikes[0]!);
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 360, 375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/historico/${saved.id}/replay`);
    await expect(
      page.getByRole('button', { name: 'Iniciar replay', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Carregando mapa…', { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/replay-${width}.png`,
      fullPage: true,
    });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    page.getByRole('button', { name: 'Iniciar replay', exact: true }),
  ).toBeDisabled();
  const slider = page.getByRole('slider', { name: 'Instante do replay' });
  await slider.focus();
  await slider.press('End');
  await expect(slider).toHaveValue(
    String(saved.body.intervals[0]!.end - saved.body.startedAt),
  );
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
});
test('Parte 13: local saved ride replays offline and remains one ride after synchronization', async ({
  page,
}) => {
  test.setTimeout(60000);
  await prepare(page);
  await begin(page);
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
  // A fulfilled map fixture bypasses network offline mode: fail this provider explicitly.
  await page.unroute('https://tiles.openfreemap.org/**');
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.abort('internetdisconnected'),
  );
  await page.context().setOffline(true);
  await finish(page);
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(page.getByText(/Estado: Salvo no aparelho/)).toBeVisible();
  await page
    .getByRole('link', { name: 'Abrir atividade no histórico', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Reproduzir Ride', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Iniciar replay', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Replay local sem base cartográfica' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Iniciar replay', exact: true })
    .click();
  await expect(page.getByText('Concluído', { exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: 'Voltar ao histórico', exact: true })
    .click();
  await page.context().setOffline(false);
  await page
    .getByRole('button', { name: 'Sincronizar agora', exact: true })
    .click();
  await expect(
    page.locator('[aria-label="Histórico sincronizado"] article'),
  ).toHaveCount(1, { timeout: 20000 });
  await expect(
    page.locator('[aria-label="Histórico no aparelho"] article'),
  ).toHaveCount(0);
});
test('Parte 13: insufficient, unauthenticated, other-account and deleted replay', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const bikes = await prepare(page),
    saved = await seed(page, bikes[0]!, true);
  await page.goto(`/historico/${saved.id}/replay`);
  await expect(
    page.getByRole('heading', { name: 'Replay indisponível', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Iniciar replay', exact: true }),
  ).toHaveCount(0);
  const context = await browser.newContext(),
    other = await context.newPage();
  expect(
    (await other.request.get(`/api/rides/${saved.id}/replay`)).status(),
  ).toBe(401);
  await prepare(other, false);
  expect(
    (
      await other.request.get(`/api/rides/${saved.id}/replay?kind=gps`)
    ).status(),
  ).toBe(404);
  await context.close();
  expect(
    (
      await page.request.delete(`/api/rides/${saved.id}`, {
        headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': saved.csrf },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'Atividade não encontrada.',
  );
});
