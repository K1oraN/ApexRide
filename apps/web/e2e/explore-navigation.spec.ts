import { chooseOption } from './choices';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { prepare, begin } from './ride-fixtures';
const require = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { Pool } =
  require('pg') as typeof import('../../api/node_modules/@types/pg');
const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];
const directory = '../../.local/screenshots/refinamento4';
test.describe.configure({ mode: 'serial' });
async function capture(page: Page, name: string, all = true) {
  await mkdir(directory, { recursive: true });
  for (const width of all ? widths : [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if ((await page.locator('html').evaluate((el) => el.scrollWidth)) > width)
      console.log(
        await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 20)
            .map((el) => ({
              tag: el.tagName,
              class: el.className,
              width: el.getBoundingClientRect().width,
              right: el.getBoundingClientRect().right,
              text: el.textContent?.slice(0, 60),
            })),
        ),
      );
    expect(
      await page.locator('html').evaluate((el) => el.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `${directory}/${name}-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  if (await page.locator('.navigation-page').count()) {
    await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
    await page.waitForTimeout(1100);
    await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
  }
}
async function session(page: Page) {
  const me = await (await page.request.get('/api/auth/me')).json();
  return {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    user: me.user,
  };
}
const data = {
  name: 'Percurso sintético Etapa 4',
  description: 'Fixture controlada, não é rota recomendada.',
  city: 'Maceió',
  state: 'AL',
  category: 'Turismo',
  source: 'manual',
  durationSeconds: null,
  startLine: null,
  direction: null,
  geometry: {
    type: 'LineString',
    coordinates: [
      [-35.735, -9.665],
      [-35.725, -9.665],
      [-35.725, -9.655],
    ],
  },
  waypoints: [
    [-35.735, -9.665],
    [-35.725, -9.655],
  ],
};
test('Destinos: indisponibilidade real, ambiguidade/erro em fixture explícita e seleção por coordenadas', async ({
  page,
}) => {
  await prepare(page, false);
  const providers = await (
    await page.request.get('/api/routes/providers')
  ).json();
  expect(providers.geocoding).toBe(false);
  // UI-only fixture: does not certify a real MapTiler account or provider response.
  await page.route('**/api/routes/providers', (route) =>
    route.fulfill({
      json: {
        routing: true,
        geocoding: true,
        geocoder: 'MapTiler',
        elevation: false,
      },
    }),
  );
  await page.route('**/api/routes/geocode', async (route) => {
    const query = route.request().postDataJSON().query;
    if (query === 'Falha')
      return route.fulfill({
        status: 503,
        json: { message: 'Busca indisponível na fixture de teste.' },
      });
    return route.fulfill({
      json: {
        attribution: 'Resultados sintéticos de teste',
        places:
          query === 'Nada'
            ? []
            : [
                {
                  id: '1',
                  label: 'Maceió, AL · endereço sintético 1',
                  coordinate: [-35.73, -9.66],
                },
                {
                  id: '2',
                  label: 'Maceió, AL · endereço sintético 2',
                  coordinate: [-35.72, -9.65],
                },
              ],
      },
    });
  });
  await page.goto('/explorar');
  await page.getByRole('button', { name: 'Destinos', exact: true }).click();
  await page.getByLabel('Buscar destino', { exact: true }).fill('Nada');
  await page
    .getByRole('button', { name: 'Buscar endereço', exact: true })
    .click();
  await expect(page.getByText(/Nenhum destino encontrado/)).toBeVisible();
  await page.getByLabel('Buscar destino', { exact: true }).fill('Falha');
  await page
    .getByRole('button', { name: 'Buscar endereço', exact: true })
    .click();
  await expect(
    page.getByText('Busca indisponível na fixture de teste.'),
  ).toBeVisible();
  await page.getByLabel('Buscar destino', { exact: true }).fill('Maceió');
  await page
    .getByRole('button', { name: 'Buscar endereço', exact: true })
    .click();
  await expect(
    page
      .getByRole('list', { name: 'Destinos encontrados' })
      .getByRole('button'),
  ).toHaveCount(2);
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await page
    .getByRole('button', { name: 'Maceió, AL · endereço sintético 2' })
    .click();
  await expect(page).toHaveURL(/destino=-35.72/);
  await page.getByText('Usar coordenadas', { exact: true }).click();
  await page.getByLabel('Latitude', { exact: true }).fill('100');
  await page.getByLabel('Longitude', { exact: true }).fill('0');
  await page
    .getByRole('button', { name: 'Adicionar coordenada', exact: true })
    .click();
  await expect(page.getByText(/Informe latitude de/)).toBeVisible();
});
test('Explorar: filtros, localização voluntária, GPX privado, elevação e oito larguras', async ({
  page,
}) => {
  test.setTimeout(120000);
  await prepare(page, false);
  const auth = await session(page);
  await page.goto('/explorar');
  await expect(
    page.getByText('Nenhuma rota encontrada', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await capture(page, 'explorar-vazio');
  await page
    .getByRole('button', { name: 'Minha localização', exact: true })
    .click();
  await page.evaluate(() => window.__gpsTest.fail(1));
  await expect(
    page.getByRole('status').filter({ hasText: /negad|autoriz/i }),
  ).toBeVisible();
  await page.goto('/app');
  await page.goto('/explorar');
  await page
    .getByRole('button', { name: 'Minha localização', exact: true })
    .click();
  await page.evaluate(() => window.__gpsTest.emit({ accuracy: 100 }));
  await expect(
    page.getByRole('status').filter({ hasText: /precis|sinal/i }),
  ).toBeVisible();
  await page.evaluate(() => window.__gpsTest.emit({ accuracy: 8 }));
  await expect(page.getByText(/Posição atual · precisão/)).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(0);
  const created = await page.request.post('/api/routes', {
    headers: auth.headers,
    data,
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).route.id;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'verify-full'
        ? { rejectUnauthorized: true }
        : false,
  });
  try {
    await pool.query("UPDATE routes SET status='approved' WHERE id=$1", [id]);
  } finally {
    await pool.end();
  }
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await capture(page, 'explorar-rotas-sinteticas');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await capture(page, 'filtros');
  await page.getByLabel('Estado (UF)', { exact: true }).fill('SP');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: /Filtros.*ativos/ }).click();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('searchbox').fill('inexistente');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpar busca de percursos' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('link', { name: 'Criar percurso', exact: true }).click();
  await capture(page, 'editor-novo');
  await page
    .getByText('Importar GPX como planejamento', { exact: true })
    .click();
  const xml = `<gpx><trk><name>GPX sintético</name><trkseg>${Array.from({ length: 9 }, (_, i) => `<trkpt lat="-9.66" lon="${-35.73 + i * 0.001}"><ele>${100 + i * 10}</ele></trkpt>`).join('')}</trkseg></trk></gpx>`;
  await page.getByLabel('Arquivo GPX').setInputFiles({
    name: 'sintetico.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(xml),
  });
  await page.getByRole('button', { name: 'Usar segmento no rascunho' }).click();
  await expect(
    page.getByText('Fonte: altitude informada no GPX', { exact: false }),
  ).toBeVisible();
  await capture(page, 'editor-gpx-elevacao');
  await page.getByLabel('Ponto do perfil').fill('4');
  await page
    .getByRole('button', { name: 'Salvar rascunho privado', exact: true })
    .click();
  await expect(
    page.getByText('Rascunho privado', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.elevation-summary').getByText(/Subida/),
  ).toBeVisible();
  await capture(page, 'perfil-elevacao');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Exportar meu percurso em GPX' })
    .click();
  expect((await download).suggestedFilename()).toBe('percurso-apex.gpx');
  const circuit = await page.request.post('/api/circuits', {
    headers: auth.headers,
    data: {
      ...data,
      name: 'Circuito sintético não verificado',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-35.73, -9.66],
          [-35.729, -9.66],
          [-35.729, -9.659],
          [-35.73, -9.66],
        ],
      },
      waypoints: [
        [-35.73, -9.66],
        [-35.73, -9.66],
      ],
    },
  });
  expect(circuit.status()).toBe(201);
  const circuitId = (await circuit.json()).route.id;
  await page.goto(`/explorar/${circuitId}`);
  await expect(
    page.getByText('Sugerido · sem verificação para voltas'),
  ).toBeVisible();
  await capture(page, 'circuito-sintetico');
});
test('Navegação interna com provedor loopback: curva, falha, recálculo, áudio e GPS compartilhado com Ride', async ({
  page,
}) => {
  test.setTimeout(120000);
  await prepare(page);
  const auth = await session(page);
  const created = await page.request.post('/api/routes', {
    headers: auth.headers,
    data,
  });
  const id = (await created.json()).route.id;
  await page.goto(`/explorar/navegar?percurso=${id}`);
  await page
    .getByRole('button', { name: 'Calcular itinerário com instruções' })
    .click();
  await expect(
    page.getByText('Pronto para navegar', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await page.getByRole('button', { name: 'Iniciar somente navegação' }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
  await expect(page.locator('.navigation-instruction')).toContainText(
    'Vire à esquerda',
  );
  await capture(page, 'navegacao-conversao');
  if (
    await page
      .getByRole('button', { name: 'Ativar voz', exact: true })
      .isVisible()
  ) {
    await page.getByRole('button', { name: 'Ativar voz', exact: true }).click();
    await page
      .getByRole('button', { name: 'Desativar voz', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Ativar voz', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  }
  await page.request.get(`${process.env.E2E_ROUTING_FIXTURE_URL}/fixture/fail`);
  await page
    .getByRole('button', { name: 'Recalcular percurso', exact: true })
    .click();
  await expect(page.getByText(/Provedor de rotas indisponível/)).toBeVisible();
  await expect(page.locator('.navigation-instruction')).toContainText(
    'Fora da rota',
  );
  await capture(page, 'navegacao-recalculo-falhou');
  await page.request.get(
    `${process.env.E2E_ROUTING_FIXTURE_URL}/fixture/restore`,
  );
  // New explicit plan avoids waiting through the protected 30-second automatic cooldown.
  await page
    .getByRole('button', { name: 'Encerrar navegação', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Calcular itinerário com instruções' })
    .click();
  await page.getByRole('button', { name: 'Iniciar somente navegação' }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7348 }));
  await page.getByRole('link', { name: 'Navegar e registrar Ride' }).click();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await begin(page);
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await page.getByRole('link', { name: /Navegação ativa · Voltar/ }).click();
  await page
    .getByRole('button', { name: 'Encerrar navegação', exact: true })
    .click();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(0);
  await page
    .getByRole('link', { name: /Ride pausado.*Voltar ao painel/ })
    .click();
  await expect(page.locator('.preview-state')).toHaveText('Pausado');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('.bottom-nav a[href="/explorar"]').click();
  await page
    .getByRole('link', { name: 'Planejar navegação', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Calcular itinerário com instruções' })
    .click();
  await page.getByRole('button', { name: 'Iniciar somente navegação' }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
  await page.request.get(`${process.env.E2E_ROUTING_FIXTURE_URL}/fixture/slow`);
  await page
    .getByRole('button', { name: 'Recalcular percurso', exact: true })
    .click();
  await expect(page.locator('.navigation-title')).toContainText('Recalculando');
  await capture(page, 'navegacao-recalculando', false);
  await expect(page.getByText(/Rota atualizada/)).toBeVisible();
  await capture(page, 'navegacao-recalculada');
  await page
    .getByRole('link', { name: 'Abrir Ride em andamento', exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Resumo da atividade' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await page.getByRole('link', { name: /Navegação ativa · Voltar/ }).click();
  await page
    .getByRole('button', { name: 'Encerrar navegação', exact: true })
    .click();
  expect(errors).toEqual([]);
});
test('Editor: NoRoute no provedor loopback preserva pontos e permite rascunho manual explícito', async ({
  page,
}) => {
  await page.request.get(
    `${process.env.E2E_ROUTING_FIXTURE_URL}/fixture/restore`,
  );
  await prepare(page, false);
  await page.goto('/explorar/novo');
  await page.getByText('Usar coordenadas', { exact: true }).click();
  for (const point of [
    [-35.73, -9.66],
    [-35.72, -9.65],
  ]) {
    await page.getByLabel('Latitude', { exact: true }).fill(String(point[1]));
    await page.getByLabel('Longitude', { exact: true }).fill(String(point[0]));
    await page
      .getByRole('button', { name: 'Adicionar coordenada', exact: true })
      .click();
  }
  await page.request.get(
    `${process.env.E2E_ROUTING_FIXTURE_URL}/fixture/no-route`,
  );
  await page
    .getByRole('button', { name: 'Calcular caminho', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Não foram encontradas vias',
  );
  await expect(
    page.getByRole('button', { name: 'Remover', exact: true }),
  ).toHaveCount(2);
  await chooseOption(page, 'Traçado', 'manual');
  await page
    .getByLabel('Nome', { exact: true })
    .fill('Rascunho manual sintético após falha');
  await page
    .getByRole('button', { name: 'Salvar rascunho privado', exact: true })
    .click();
  await expect(
    page.getByText('Rascunho privado', { exact: true }),
  ).toBeVisible();
});
