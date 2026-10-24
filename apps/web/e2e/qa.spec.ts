import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { mockMapProvider } from './gps-fixtures';

test('23C teclado, foco e preferência de movimento reduzido', async ({
  page,
}) => {
  await mockMapProvider(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav.getByRole('link')).toHaveCount(5);
  await nav.getByRole('link', { name: 'Ride', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ride$/);
  await expect(page.getByRole('main')).toBeFocused();
  expect(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true);
});

test('23D correlação de API, erros seguros e cabeçalhos administrativos', async ({
  request,
}) => {
  const missing = await request.get('/api/qa-rota-inexistente');
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ code: 'HTTP_404' });
  expect(missing.headers()['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  expect(missing.headers()['cache-control']).toContain('no-store');
  expect(missing.headers()['x-content-type-options']).toBe('nosniff');
  const admin = await request.get('/admin');
  expect(admin.headers()['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(admin.headers()['cache-control']).toContain('no-store');
});

test('23F registra tempos locais de Início, Ride e Comunidade', async ({
  page,
  browserName,
}) => {
  await mockMapProvider(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const records = [];
  for (const path of ['/', '/ride', '/comunidade']) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(
      page.getByRole('navigation', { name: 'Navegação principal' }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    records.push(
      await page.evaluate((path) => {
        const navigation = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;
        const fcp = performance
          .getEntriesByType('paint')
          .find((entry) => entry.name === 'first-contentful-paint');
        return {
          path,
          domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
          loadMs: Math.round(navigation.loadEventEnd),
          firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
          resources: performance.getEntriesByType('resource').length,
        };
      }, path),
    );
  }
  await writeFile(
    '../../.local/parte23-frontend-performance.json',
    JSON.stringify(
      {
        environment: `${browserName} desktop headless; viewport 390x844; loopback; sem throttling; provedor de mapas simulado`,
        records,
        limitations:
          'Não mede INP, LCP/CLS de campo, bateria, memória móvel ou capacidade de produção.',
      },
      null,
      2,
    ),
  );
});
