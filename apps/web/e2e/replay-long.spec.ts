import { expect, test } from '@playwright/test';
import { prepare } from './ride-fixtures';
import { telemetryFixture } from '../../api/test/telemetry-fixtures';
test('Parte 13: loads 50000 original points progressively and seeks a long activity', async ({
  page,
}) => {
  test.setTimeout(120000);
  const bikes = await prepare(page),
    me = await (await page.request.get('/api/auth/me')).json();
  const body = telemetryFixture();
  body.motorcycleId = bikes[0]!;
  body.mode = 'passeio';
  body.startedAt = Date.now() - 50001000;
  body.endedAt = body.startedAt + 50000000;
  body.intervals = [{ start: body.startedAt, end: body.endedAt }];
  body.points = Array.from({ length: 50000 }, (_, i) => ({
    timestamp: body.startedAt + i * 1000,
    longitude: -35.73 + i * 0.00001,
    latitude: -9.66,
    accuracy: 5,
    speed: 10,
    heading: 90,
    altitude: null,
    segment: 0,
  }));
  const response = await page.request.post('/api/rides', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data: body,
  });
  expect(response.status()).toBe(201);
  const id = (await response.json()).id;
  let pages = 0;
  page.on('response', (r) => {
    if (r.url().includes('/replay?kind=gps')) pages++;
  });
  await page.goto(`/historico/${id}/replay`);
  await expect(
    page.getByRole('button', { name: 'Iniciar replay', exact: true }),
  ).toBeVisible({ timeout: 45000 });
  expect(pages).toBe(50);
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  const slider = page.getByRole('slider', { name: 'Instante do replay' });
  await slider.focus();
  await slider.press('End');
  await expect(slider).toHaveValue('50000000');
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await page
    .getByRole('button', { name: 'Continuar replay', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Pausar replay', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Pausar replay', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Voltar ao histórico', exact: true })
    .click();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
});
