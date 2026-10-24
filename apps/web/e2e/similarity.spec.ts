import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { prepare } from './ride-fixtures';
import { processBatch } from '../../api/src/modules/similarity/worker';
const require = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { Pool } =
  require('pg') as typeof import('../../api/node_modules/@types/pg');
async function seed(page: Page, partial = false, reverse = false) {
  const bikes = await prepare(page),
    me = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    ids: string[] = [];
  for (let n = 0; n < 2; n++) {
    const start = Date.now() - 300000 - n * 86400000,
      count = partial && n === 1 ? 61 : 201;
    const r = await page.request.post('/api/rides', {
      headers,
      data: {
        clientId: randomUUID(),
        motorcycleId: bikes[0],
        mode: 'misto',
        visibility: 'public',
        startedAt: start,
        endedAt: start + count * 1000,
        intervals: [{ start, end: start + count * 1000 }],
        points: Array.from({ length: count }, (_, i) => ({
          longitude:
            -35.73 +
            ((reverse && n === 1 ? count - 1 - i : i) +
              (partial && n === 1 ? 40 : 0)) *
              0.0001,
          latitude: -9.66,
          timestamp: start + i * 1000,
          accuracy: 3,
          speed: 11,
          heading: null,
          altitude: null,
          segment: 0,
        })),
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    ids.push((await r.json()).id);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'verify-full'
        ? { rejectUnauthorized: true }
        : false,
  });
  try {
    await expect
      .poll(
        async () => {
          await processBatch(pool, 10);
          return (
            await pool.query(
              "SELECT count(*)::int AS n FROM ride_similarity_index WHERE ride_id=ANY($1::uuid[]) AND status='done'",
              [ids],
            )
          ).rows[0].n;
        },
        { timeout: 30000 },
      )
      .toBe(ids.length);
  } finally {
    await pool.end();
  }
  return ids;
}
test('Parte 15: sem rota, grupos privados, mapa, comparação e replay', async ({
  page,
}) => {
  test.setTimeout(90000);
  const ids = await seed(page);
  await page.goto('/historico');
  await expect(
    page.getByRole('heading', { name: 'Trajetos Semelhantes', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Trajeto semelhante · 2 atividades' }),
  ).toBeVisible();
  await page.goto(`/historico/${ids[0]}`);
  await page
    .getByRole('link', { name: 'Trajetos Semelhantes', exact: true })
    .click();
  await expect(
    page.getByText('Muito semelhante', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Selecionar e ver mapa' }).click();
  await expect(
    page.getByRole('heading', { name: 'Mapa da correspondência' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Comparar trechos comuns', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Comparáveis integralmente',
      exact: true,
    }),
  ).toBeVisible();
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 360, 375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/similarity-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole('link', {
      name: 'Abrir replay individual da atividade 1',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Reproduzir Ride', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Voltar aos trajetos semelhantes', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Comparar trechos comuns', exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel('Faixa de cilindrada', { exact: true })
    .selectOption('0');
  await expect(
    page.getByText('Nenhuma correspondência disponível nesta consulta.', {
      exact: true,
    }),
  ).toBeVisible();
});
test('Parte 15: parcial, coberturas distintas e descoberta comunitária vazia', async ({
  page,
}) => {
  test.setTimeout(60000);
  const ids = await seed(page, true);
  await page.goto(`/historico/${ids[0]}/semelhantes`);
  await expect(
    page.getByText('Parcialmente semelhante', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Selecionar e ver mapa' }).click();
  await page
    .getByRole('button', { name: 'Comparar trechos comuns', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Comparáveis parcialmente',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/descobertas');
  await page
    .getByText('Descobertas de trajetos semelhantes', { exact: true })
    .click();
  await expect(
    page.getByText(
      'Nenhuma região administrativa está disponível para descoberta comunitária.',
      { exact: true },
    ),
  ).toBeVisible();
});
test('Parte 15: sentido contrário bloqueia comparação e mantém mapa', async ({
  page,
}) => {
  test.setTimeout(60000);
  const ids = await seed(page, false, true);
  await page.goto(`/historico/${ids[0]}/semelhantes`);
  await expect(
    page.getByText('Semelhante em sentido contrário', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Selecionar e ver mapa' }).click();
  await expect(
    page.getByRole('button', { name: 'Comparar trechos comuns', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Mapa da correspondência' }),
  ).toBeVisible();
});
