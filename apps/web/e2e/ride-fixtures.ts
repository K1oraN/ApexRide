import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mockGps, mockMapProvider } from './gps-fixtures';
export async function prepare(page: Page, withBike = true) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const headers = { 'X-Apex-Request': '1' };
  const email = `${suffix}@example.com`,
    password = 'senha longa para testar as sessoes';
  expect(
    (
      await page.request.post('/api/auth/register', {
        headers,
        data: {
          displayName: 'Piloto Ride',
          username: `ride_${suffix}`,
          email,
          password,
          acceptTerms: true,
          termsVersion: 'prelaunch-draft',
          privacyVersion: 'prelaunch-draft',
        },
      })
    ).status(),
  ).toBe(201);
  const session = await page.request.post('/api/auth/login', {
    headers,
    data: { email, password },
  });
  expect(session.status()).toBe(200);
  const csrf = (await session.json()).csrfToken;
  const authHeaders = { ...headers, 'X-CSRF-Token': csrf };
  await page.request.patch('/api/users/me/privacy', {
    headers: authHeaders,
    data: { activityVisibility: 'private' },
  });
  const bikes: string[] = [];
  if (withBike)
    for (const model of ['CB 650R', 'CRF 300L']) {
      const response = await page.request.post('/api/motorcycles', {
        headers: authHeaders,
        data: { brand: 'Honda', model, year: 2024, displacementCc: 649 },
      });
      expect(response.status()).toBe(201);
      bikes.push((await response.json()).motorcycle.id);
    }
  await mockMapProvider(page);
  await mockGps(page);
  await page.goto('/ride');
  return bikes;
}
export async function begin(page: Page) {
  await page.getByRole('button', { name: 'Iniciar Ride', exact: true }).click();
  await expect(page.locator('.preview-state')).toHaveText('Aguardando GPS');
  await page.evaluate(() => window.__gpsTest.emit());
  await expect(page.locator('.preview-state')).toHaveText('Em andamento');
}
export async function finish(page: Page) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Resumo da atividade' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(0);
}
