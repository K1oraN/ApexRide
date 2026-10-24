import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { prepare } from './ride-fixtures';
const require = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { Pool } =
  require('pg') as typeof import('../../api/node_modules/@types/pg');
async function seed(page: Page, partial = false) {
  const bikes = await prepare(page),
    me = await (await page.request.get('/api/auth/me')).json(),
    headers = { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken };
  const body = {
    name: 'Rota sintética Parte 14',
    description: 'Dados exclusivamente de teste',
    city: 'Maceió',
    state: 'AL',
    category: 'Turismo',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-35.73, -9.66],
        [-35.72, -9.66],
      ],
    },
    waypoints: [
      [-35.73, -9.66],
      [-35.72, -9.66],
    ],
    source: 'manual',
    durationSeconds: null,
    startLine: null,
    direction: null,
  };
  const response = await page.request.post('/api/routes', {
    headers,
    data: body,
  });
  expect(response.status()).toBe(201);
  const plan = (await response.json()).route;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'verify-full'
        ? { rejectUnauthorized: true }
        : false,
  });
  try {
    await pool.query("UPDATE routes SET status='approved' WHERE id=$1", [
      plan.id,
    ]);
    await pool.query(
      'INSERT INTO route_versions(route_id,version,plan) VALUES($1,1,$2)',
      [plan.id, JSON.stringify(plan)],
    );
  } finally {
    await pool.end();
  }
  const ids: string[] = [];
  for (let n = 0; n < 5; n++) {
    const start = Date.now() - 300000 - n * 86400000,
      count = partial && n === 1 ? 51 : 101;
    const r = await page.request.post('/api/rides', {
      headers,
      data: {
        clientId: randomUUID(),
        motorcycleId: bikes[0],
        mode: 'misto',
        visibility: 'public',
        startedAt: start,
        endedAt: start + 101000,
        intervals: [{ start, end: start + 101000 }],
        points: Array.from({ length: count }, (_, i) => ({
          longitude: -35.73 + i * 0.0001,
          latitude: -9.66,
          timestamp: start + i * 1000,
          accuracy: 5,
          speed: 11,
          heading: 90,
          altitude: null,
          segment: 0,
        })),
        route: { plan, abandoned: false },
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    ids.push((await r.json()).id);
  }
  return { route: plan.id as string, ids };
}
test('Parte 14: 2–4 atividades, filtros, mapa, gráficos, responsividade e retorno do replay', async ({
  page,
}) => {
  test.setTimeout(90000);
  const { route, ids } = await seed(page);
  await page.goto('/explorar/' + route);
  await page
    .getByRole('link', { name: 'Comparar atividades nesta rota', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Comparar atividades', exact: true }),
  ).toBeVisible();
  for (const id of ids.slice(0, 4))
    await page
      .getByLabel('Selecionar atividade ' + id, { exact: true })
      .click();
  await expect(
    page.getByLabel('Selecionar atividade ' + ids[4], { exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel('Selecionar atividade ' + ids[3], { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Comparar selecionadas', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Comparáveis integralmente',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Resumo comparativo' }),
  ).toContainText('Máxima GPS validada');
  await expect(
    page.getByRole('heading', { name: 'Trajetos sobrepostos', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', {
      name: 'Velocidade GPS validada por distância da rota',
    }),
  ).toBeVisible();
  await page
    .getByLabel('Métrica comparativa', { exact: true })
    .selectOption('lean');
  await expect(
    page.getByText('Métrica indisponível: dados compatíveis insuficientes.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Métrica comparativa', { exact: true })
    .selectOption('gps');
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 360, 375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/comparison-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole('img', { name: 'Velocidade GPS validada por distância da rota' })
    .screenshot({
      path: '../../.local/screenshots/comparison-chart-mobile.png',
    });
  await page
    .getByRole('heading', { name: 'Trajetos sobrepostos', exact: true })
    .locator('..')
    .screenshot({ path: '../../.local/screenshots/comparison-map-mobile.png' });
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
    .getByRole('link', { name: 'Voltar à comparação', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Comparáveis integralmente',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Faixa de cilindrada', { exact: true })
    .selectOption('0');
  await expect(
    page.getByText('Nenhuma atividade encontrada com estes filtros.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Limpar filtros', exact: true })
    .click();
  await expect(page.locator('.comparison-candidates article')).toHaveCount(5);
  await page
    .getByLabel('Categoria da moto', { exact: true })
    .selectOption('Não classificada');
  await page
    .getByLabel('Faixa de cilindrada', { exact: true })
    .selectOption('2');
  await page
    .getByRole('button', {
      name: 'Consultar estatísticas comunitárias',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Dados insuficientes para comparação comunitária.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Voltar ao histórico', exact: true })
    .click();
  await expect(page).toHaveURL(/\/historico$/);
});
test('Parte 14: parcial, indisponível offline, privacidade opt-in e revogação', async ({
  page,
}) => {
  test.setTimeout(60000);
  const { route, ids } = await seed(page, true);
  await page.goto(`/historico/${ids[0]}`);
  const optin = page.getByLabel(
    'Autorizar participação em comparações comunitárias protegidas',
    { exact: true },
  );
  await expect(optin).not.toBeChecked();
  await optin.click();
  await expect(
    page.getByText('Participação em comparações atualizada.', { exact: true }),
  ).toBeVisible();
  await expect(optin).toBeChecked();
  await optin.click();
  await expect(
    page.getByText(
      'Participação revogada. Novas consultas deixam de usar esta atividade.',
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Comparar atividades nesta rota', exact: true })
    .click();
  await page
    .getByLabel('Selecionar atividade ' + ids[1], { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Comparar selecionadas', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Comparáveis parcialmente',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Resumo comparativo' }),
  ).toContainText('Indisponível');
  await page.context().setOffline(true);
  await page
    .getByRole('button', { name: 'Comparar selecionadas', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Seleção preservada');
  expect(
    new URL(page.url()).searchParams.get('atividades')?.split(','),
  ).toHaveLength(2);
  await page.context().setOffline(false);
  await page
    .getByRole('button', { name: 'Tentar novamente', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Comparáveis parcialmente',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(
    `/explorar/${route}/comparar?atividades=${ids[0]},${randomUUID()}&executar=1`,
  );
  await expect(page.getByRole('alert')).toContainText('não está disponível');
});
