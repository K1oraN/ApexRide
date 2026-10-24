// Smoke explícito com provedor REAL; não fornece nem solicita localização.
// Execute após build, com preview/API locais ativos. Não é validação de GPS físico.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  const tiles = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (
      url.hostname === 'tiles.openfreemap.org' &&
      /\.pbf$/.test(url.pathname) &&
      response.ok()
    )
      tiles.push(url.pathname);
  });
  // Isola somente a sessão para permitir smoke sem backend. Nenhum mock de mapas.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 401, json: { message: 'Não autenticado' } }),
  );
  const origin = process.env.MAP_SMOKE_ORIGIN ?? 'http://127.0.0.1:5175';
  await page.goto(`${origin}/ride`);
  await expect(page.getByText('GPS desligado', { exact: true })).toBeVisible();
  await expect.poll(() => tiles.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByText('Carregando mapa…', { exact: true })).toBeHidden({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('button', { name: 'Ampliar mapa', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
    'OpenStreetMap',
  );
  await expect(page.locator('.gps-map-notice')).toHaveCount(0);
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.gps-map').scrollIntoViewIfNeeded();
    await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible();
    await expect
      .poll(() =>
        page.locator('html').evaluate((element) => element.scrollWidth),
      )
      .toBeLessThanOrEqual(width);
    // Evita deslocar elementos fixos na captura de página inteira.
    await page.locator('html').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `../../.local/screenshots/ride-real-map-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
  console.log(
    `OpenFreeMap real: ${tiles.length} respostas de tiles vetoriais, atribuições visíveis, 320/390/1440 px sem overflow. GPS permaneceu desligado.`,
  );
} finally {
  await browser.close();
}
