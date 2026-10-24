import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { prepare, finish } from './ride-fixtures';
const require = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { Pool } =
  require('pg') as typeof import('../../api/node_modules/@types/pg');
test('Parte 11: editor, aprovação, favorito, Ride offline e associação real', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(10000);
  await prepare(page);
  const me = await (await page.request.get('/api/auth/me')).json();
  await page.goto('/explorar/novo');
  await page
    .getByLabel('Nome', { exact: true })
    .fill('Passeio sintético de validação');
  await page.getByLabel('Cidade', { exact: true }).fill('Maceió');
  await page.getByLabel('Estado (UF)', { exact: true }).fill('AL');
  await page.getByLabel('Traçado', { exact: true }).selectOption('manual');
  const map = page.locator('.gps-map-canvas');
  await expect(page.getByText('Carregando mapa…')).toHaveCount(0);
  const box = await map.boundingBox();
  expect(box).toBeTruthy();
  await map.click({ position: { x: box!.width * 0.5, y: box!.height * 0.5 } });
  await map.click({
    position: { x: box!.width * 0.55, y: box!.height * 0.45 },
  });
  await map.click({ position: { x: box!.width * 0.6, y: box!.height * 0.4 } });
  await expect(
    page.getByRole('button', { name: 'Remover', exact: true }),
  ).toHaveCount(3);
  await page.getByRole('button', { name: 'Mover ponto 2 para cima' }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho privado', exact: true })
    .click();
  await expect(page).toHaveURL(/\/explorar\/[a-f0-9-]{36}$/);
  const routeId = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(
    page.getByText('Rascunho privado', { exact: true }),
  ).toBeVisible();
  const hidden = await page.request.get('/api/routes?q=valida%C3%A7%C3%A3o');
  expect((await hidden.json()).routes).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Solicitar publicação', exact: true })
    .click();
  await expect(page.getByText('Em análise', { exact: true })).toBeVisible();
  const context = await browser.newContext();
  const mod = await context.newPage();
  await prepare(mod, false);
  const moderator = await (await mod.request.get('/api/auth/me')).json();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'verify-full'
        ? { rejectUnauthorized: true }
        : false,
  });
  try {
    await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [
      moderator.user.id,
    ]);
    await pool.query(
      "INSERT INTO admin_user_roles(id,user_id,role_code,granted_by) VALUES($1,$2,'route_reviewer',$2)",
      [crypto.randomUUID(), moderator.user.id],
    );
    await pool.query(
      'INSERT INTO admin_sessions(session_id,user_id) SELECT id,user_id FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL',
      [moderator.user.id],
    );
  } finally {
    await pool.end();
  }
  await mod.goto('/explorar/moderacao');
  await mod
    .getByRole('button', { name: /Abrir Passeio sintético de validação/ })
    .click();
  await mod
    .getByRole('button', { name: 'Revisar publicação', exact: true })
    .click();
  await mod
    .getByLabel('Justificativa e política aplicada')
    .fill('Revisão de geometria sintética para teste automatizado.');
  await mod
    .getByRole('button', { name: 'Revisar decisão', exact: true })
    .click();
  await mod.getByLabel('Digite CONFIRMAR').fill('CONFIRMAR');
  await mod
    .getByRole('button', { name: 'Executar decisão', exact: true })
    .click();
  await expect(
    mod.getByRole('heading', {
      name: 'Passeio sintético de validação',
      exact: true,
    }),
  ).toHaveCount(0);
  await context.close();
  await page.goto('/explorar');
  await page.getByRole('searchbox').fill('validação');
  await expect(page.getByRole('article')).toHaveCount(1);
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await mkdir('../../.local/screenshots', { recursive: true });
    await page.screenshot({
      path: `../../.local/screenshots/routes-results-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole('button', {
      name: 'Favoritar Passeio sintético de validação',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Desfavoritar Passeio sintético de validação',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('link', { name: 'Passeio sintético de validação', exact: true })
    .click();
  await page.getByRole('link', { name: 'Seguir rota', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Acompanhamento da rota' }),
  ).toBeVisible();
  const detail = await (
    await page.request.get('/api/routes/' + routeId)
  ).json();
  const origin = detail.route.geometry.coordinates[0];
  await page.getByRole('button', { name: 'Iniciar Ride', exact: true }).click();
  await page.evaluate(
    ([longitude, latitude]) => window.__gpsTest.emit({ longitude, latitude }),
    origin,
  );
  await expect(page.locator('.preview-state')).toHaveText('Em andamento');
  await page.context().setOffline(true);
  await page.waitForTimeout(1100);
  await page.evaluate(
    ([longitude, latitude]) =>
      window.__gpsTest.emit({ longitude: longitude + 0.00003, latitude }),
    origin,
  );
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.evaluate(
    ([longitude, latitude]) =>
      window.__gpsTest.emit({ longitude: longitude + 0.00006, latitude }),
    origin,
  );
  await finish(page);
  await expect(
    page.getByText(/Rota: Passeio sintético de validação/),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(page.getByText(/Estado: Salvo no aparelho/)).toBeVisible();
  await page.context().setOffline(false);
  await expect(
    page.getByText('Estado: Salva e confirmada pelo servidor', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const rides = await (await page.request.get('/api/rides')).json();
  const ride = await (
    await page.request.get('/api/rides/' + rides.rides[0].id)
  ).json();
  expect(ride.ride.owner_id).toBe(me.user.id);
  expect(ride.ride.route_id).toBe(routeId);
  expect(ride.points).toHaveLength(3);
});

test('Parte 11: detalhes e editor responsivos em 320/390/430/1440 px', async ({
  page,
}) => {
  await prepare(page, false);
  const session = await (await page.request.get('/api/auth/me')).json();
  const created = await page.request.post('/api/routes', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': session.csrfToken },
    data: {
      name: 'Rota privada de teste responsivo',
      description: 'Percurso sintético para verificar os detalhes.',
      city: 'Maceió',
      state: 'AL',
      category: 'Turismo',
      source: 'manual',
      durationSeconds: null,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-35.735, -9.665],
          [-35.725, -9.665],
        ],
      },
      waypoints: [
        [-35.735, -9.665],
        [-35.725, -9.665],
      ],
      startLine: null,
      direction: null,
    },
  });
  expect(created.status()).toBe(201);
  const routeId = (await created.json()).route.id;
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/explorar/novo');
    await expect(
      page.getByRole('heading', { name: 'Criar percurso', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Carregando mapa…', { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await mkdir('../../.local/screenshots', { recursive: true });
    await page.screenshot({
      path: `../../.local/screenshots/routes-editor-${width}.png`,
      fullPage: true,
    });
    await page.goto(`/explorar/${routeId}`);
    await expect(
      page.getByRole('heading', {
        name: 'Rota privada de teste responsivo',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Carregando mapa…', { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.maplibregl-marker').first()).toBeInViewport();
    await expect(page.locator('.maplibregl-marker').last()).toBeInViewport();
    // Wait for the camera animation and worker-rendered geometry before visual QA.
    await page.waitForTimeout(1000);
    const frame = await page.locator('.gps-map-canvas').boundingBox();
    const first = await page
        .locator('.maplibregl-marker')
        .first()
        .boundingBox(),
      last = await page.locator('.maplibregl-marker').last().boundingBox();
    expect(
      Math.abs(
        (first!.x + first!.width / 2 + last!.x + last!.width / 2) / 2 -
          (frame!.x + frame!.width / 2),
      ),
    ).toBeLessThan(5);
    expect(Math.abs(last!.x - first!.x)).toBeGreaterThan(frame!.width / 4);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/routes-detail-${width}.png`,
      fullPage: true,
    });
  }
});
