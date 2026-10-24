import { expect, test } from '@playwright/test';
import { mockGps, mockMapProvider } from './gps-fixtures';

test.beforeEach(async ({ page }) => {
  await mockMapProvider(page);
  await mockGps(page);
});

test('prévia explícita, velocidade direta, marcador, percurso e encerramento sem persistência', async ({
  page,
}) => {
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') uploads.push(request.url());
  });
  await page.goto('/ride');
  await expect(page.getByText('GPS desligado', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await page.getByRole('button', { name: 'Ativar GPS', exact: true }).click();
  await expect(
    page.getByText('Aguardando sinal', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await page.evaluate(() => window.__gpsTest.emit());
  await expect(page.locator('.gauge-value')).toHaveText('36');
  await expect(
    page.getByRole('img', { name: 'Posição GPS da motocicleta', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Acompanhar motociclista' }),
  ).toBeEnabled();
  await page.waitForTimeout(1100);
  await page.evaluate(() =>
    window.__gpsTest.emit({ longitude: -35.7349, speed: 0 }),
  );
  await expect(page.locator('.gauge-value')).toHaveText('0');
  await page.evaluate(() =>
    window.__gpsTest.emit({ longitude: -35.7348, speed: null }),
  );
  await expect(page.locator('.gauge-value')).toHaveText('—');
  await expect(page.getByText('GPS disponível', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Encerrar GPS', exact: true }).click();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(0);
  await expect(page.locator('.gps-rider-marker')).toHaveCount(0);
  await expect(page.locator('.gauge-value')).toHaveText('—');
  expect(uploads).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        /gps|track|position|location/i.test(k),
      ),
    ),
  ).toEqual([]);
});

test('arrastar suspende câmera; centralizar retoma acompanhamento', async ({
  page,
}) => {
  await page.goto('/ride');
  await page.getByRole('button', { name: 'Ativar GPS' }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await expect(
    page.getByRole('button', { name: 'Acompanhar motociclista' }),
  ).toBeEnabled();
  const canvas = page.locator('.gps-map canvas');
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * 0.3, rect.y + rect.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width * 0.6,
    rect.y + rect.height * 0.65,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(
    page.getByText('Explorando mapa', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Acompanhar motociclista' }).click();
  await expect(
    page.getByText('Acompanhando motociclista', { exact: true }),
  ).toBeVisible();
});

test('negação orienta configuração e não insiste; timeout permite nova tentativa', async ({
  page,
}) => {
  await page.goto('/ride');
  await page.getByRole('button', { name: 'Ativar GPS' }).click();
  await page.evaluate(() => window.__gpsTest.fail(1));
  await expect(
    page.getByText('Permissão negada', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.gps-details').getByRole('status')).toContainText(
    'configurações do navegador',
  );
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(0);
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(1);
  await page.getByRole('button', { name: 'Ativar GPS' }).click();
  await page.evaluate(() => window.__gpsTest.fail(3));
  await expect(page.locator('.gps-details').getByRole('status')).toContainText(
    'Tempo esgotado',
  );
  await page.getByRole('button', { name: 'Tentar GPS novamente' }).click();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(3);
});

test('pontos antigos, imprecisos e saltos não exibem velocidade atual', async ({
  page,
}) => {
  await page.goto('/ride');
  await page.getByRole('button', { name: 'Ativar GPS' }).click();
  await page.evaluate(() => window.__gpsTest.emit({}, Date.now() - 60_000));
  await expect(
    page.getByText('Sinal desatualizado', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.gps-rider-marker')).toHaveCount(0);
  await page.evaluate(() => window.__gpsTest.emit({ accuracy: 100 }));
  await expect(
    page.getByText('Precisão reduzida', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.gauge-value')).toHaveText('—');
  await page.evaluate(() =>
    window.__gpsTest.emit({ latitude: -8 }, Date.now() + 1_000),
  );
  await expect(page.locator('.gps-details').getByRole('status')).toContainText(
    'descartada',
  );
});

test('sair do Ride encerra watch; voltar não reativa nem recupera percurso', async ({
  page,
}) => {
  await page.goto('/ride');
  await page.getByRole('button', { name: 'Ativar GPS' }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Explorar', exact: true })
    .click();
  await expect(page).toHaveURL(/\/explorar$/);
  await expect
    .poll(() => page.evaluate(() => window.__gpsTest.active()))
    .toBe(0);
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Ride', exact: true })
    .click();
  await expect(page.getByText('GPS desligado', { exact: true })).toBeVisible();
  await expect(page.locator('.gps-rider-marker')).toHaveCount(0);
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(1);
});

test('falha do provedor não interrompe GPS e recuperação pode ser solicitada', async ({
  page,
}) => {
  await page.unroute('https://tiles.openfreemap.org/**');
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.abort(),
  );
  await page.goto('/ride');
  await expect(
    page.getByText('Mapa indisponível.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ativar GPS' }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await expect(page.locator('.gauge-value')).toHaveText('36');
  await page.unroute('https://tiles.openfreemap.org/**');
  await mockMapProvider(page);
  await page.getByRole('button', { name: 'Tentar carregar mapa' }).click();
  await expect(
    page.getByRole('button', { name: 'Acompanhar motociclista' }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(1);
});

test('permissão e geolocalização do Chrome emuladas pelo contexto, sem mock do serviço', async ({
  browser,
}) => {
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: -9.665, longitude: -35.735, accuracy: 10 },
  });
  try {
    const page = await context.newPage();
    await mockMapProvider(page);
    await page.goto('http://127.0.0.1:5174/ride');
    await expect(
      page.getByText('GPS desligado', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ativar GPS' }).click();
    await expect(
      page.getByText('GPS disponível', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', {
        name: 'Posição GPS da motocicleta',
        exact: true,
      }),
    ).toBeVisible();
    await context.setGeolocation({
      latitude: -9.6649,
      longitude: -35.735,
      accuracy: 10,
    });
    await expect(
      page.getByText('GPS disponível', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Encerrar GPS' }).click();
  } finally {
    await context.close();
  }
});
