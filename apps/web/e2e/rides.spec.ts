import { chooseOption } from './choices';
import { openRideSetting } from './ride-settings';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepare, begin, finish } from './ride-fixtures';
import { mockMotion } from './motion-fixtures';
test('Parte 09: modos, eventos passivos, gráficos reais e persistência privada com série sintética', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(Date.now() - 60000) });
  await prepare(page);
  const speeds = [
    0, 0, 0, 0, 0, 5, 10, 15, 20, 25, 28, 30, 30, 27.5, 22.5, 17.5, 12.5, 7.5,
    2.5, 0, 0, 0, 0, 0,
  ];
  for (const mode of ['passeio', 'pista', 'misto']) {
    await chooseOption(page, 'Modo de pilotagem', mode);
    await expect(page.locator('.force-grid')).toHaveCount(
      mode === 'passeio' ? 0 : 1,
    );
    await expect(page.locator('.lean-grid')).toHaveCount(
      mode === 'passeio' ? 0 : 1,
    );
    await page
      .getByRole('button', { name: 'Iniciar Ride', exact: true })
      .click();
    let meters = 0;
    for (let i = 0; i < speeds.length; i++) {
      if (i) {
        await page.clock.fastForward(500);
        meters += ((speeds[i - 1]! + speeds[i]!) / 2) * 0.5;
      }
      await page.evaluate(
        ({ speed, longitude }) =>
          window.__gpsTest.emit({ speed, longitude, accuracy: 3 }),
        { speed: speeds[i]!, longitude: -35.735 + meters / 109600 },
      );
    }
    await finish(page);
    if (mode === 'passeio') {
      await expect(
        page.getByRole('region', { name: 'Eventos estimados da sessão' }),
      ).toHaveCount(0);
      await expect(
        page.getByText('Aceleração máxima estimada', { exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByText('0–100 km/h · 1 válidos', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('100–0 km/h · 1 válidos', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('img', {
          name: 'Velocidade GPS por tempo da atividade',
        }),
      ).toBeVisible();
      await expect(
        page.getByText('Medição indisponível: dados insuficientes.', {
          exact: true,
        }),
      ).toHaveCount(2);
      for (const width of [320, 390, 430, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await mkdir('../../.local/screenshots', { recursive: true });
        await page.screenshot({
          path: `../../.local/screenshots/telemetry-${mode}-${width}.png`,
          fullPage: true,
        });
      }
      await chooseOption(page, 'Série de velocidade', 'assisted');
      await expect(
        page.getByText('Medição indisponível: dados insuficientes.', {
          exact: true,
        }),
      ).toHaveCount(3);
    }
    await page
      .getByRole('button', { name: 'Salvar atividade', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Atividade salva com sucesso.',
    );
    const list = (await (await page.request.get('/api/rides')).json()).rides;
    const detail = await (
      await page.request.get(`/api/rides/${list[0].id}`)
    ).json();
    if (mode === 'passeio') expect(detail.telemetry).toBeNull();
    else {
      expect(detail.telemetry.events).toHaveLength(2);
      expect(detail.telemetry.stats.accelerationCount).toBe(1);
    }
    await page.getByRole('button', { name: 'Preparar novo Ride' }).click();
  }
});

test('GPS Assistido, preferência por conta, troca ativa e série separada', async ({
  page,
}) => {
  await mockMotion(page);
  await prepare(page);
  await openRideSetting(page, 'speed');
  const selection = page.getByRole('group', {
    name: 'Velocidade da telemetria',
  });
  await expect(
    selection.getByRole('radio', { name: 'GPS Assistido Automático' }),
  ).toBeChecked();
  await selection.getByRole('radio', { name: 'GPS Puro' }).check();
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/auth/me')).json()).user.telemetry
          .speedMode,
    )
    .toBe('pure');
  await page.reload();
  await openRideSetting(page, 'speed');
  await expect(
    selection.getByRole('radio', { name: 'GPS Puro' }),
  ).toBeChecked();
  await selection
    .getByRole('radio', { name: 'GPS Assistido Automático' })
    .check();
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/auth/me')).json()).user.telemetry
          .speedMode,
    )
    .toBe('assisted');
  await openRideSetting(page, 'motion');
  await openRideSetting(page, 'calibration');
  const sensors = page.getByRole('region', { name: 'Sensores de movimento' });
  await sensors.getByRole('button', { name: 'Ativar Sensores' }).click();
  await page.evaluate(() => window.__motionTest.start());
  await expect(sensors.getByRole('status')).toContainText(
    'Sensores funcionando',
  );
  await sensors
    .getByLabel('Celular firmemente fixado no suporte indicado')
    .check();
  await sensors
    .getByLabel('Confirmo que a moto está parada e vertical')
    .check();
  await sensors
    .getByRole('button', { name: 'Calibrar sensores', exact: true })
    .click();
  await expect(
    sensors.getByRole('button', { name: 'Recalibrar sensores' }),
  ).toBeEnabled({ timeout: 6000 });
  await begin(page);
  const gpsPulse = await page.evaluate(() =>
    window.setInterval(() => window.__gpsTest.emit(), 1000),
  );
  await expect(page.locator('.speed-source')).toHaveText(
    'GPS Assistido ativo · estimativa',
  );
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.locator('.ride-dashboard').screenshot({
      path: `../../.local/screenshots/speed-assisted-${width}.png`,
    });
  }
  await page.evaluate(() => {
    window.__gpsTest.emit();
    window.__motionTest.acceleration(1);
  });
  await expect
    .poll(
      async () => Number(await page.locator('.gauge-value').textContent()),
      { intervals: [50] },
    )
    .toBeGreaterThan(36);
  const starts = await page.evaluate(() => window.__gpsTest.starts);
  await page
    .getByRole('navigation', { name: 'Área Ride' })
    .getByRole('link', { name: 'Telemetria', exact: true })
    .click();
  // A preferência exige uma pausa para evitar configuração durante pilotagem.
  await page
    .getByRole('navigation', { name: 'Área Ride' })
    .getByRole('link', { name: 'Painel', exact: true })
    .click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Área Ride' })
    .getByRole('link', { name: 'Telemetria', exact: true })
    .click();
  await selection.getByRole('radio', { name: 'GPS Puro' }).check();
  await page
    .getByRole('navigation', { name: 'Área Ride' })
    .getByRole('link', { name: 'Painel', exact: true })
    .click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await expect(page.locator('.speed-source')).toHaveText(
    'GPS Puro selecionado',
  );
  await expect(page.locator('.gauge-value')).toHaveText('36');
  await expect(page.locator('.preview-state')).toHaveText('Em andamento');
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(starts + 1);
  await finish(page);
  await page.evaluate((timer) => window.clearInterval(timer), gpsPulse);
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Atividade salva com sucesso.',
  );
  const saved = (await (await page.request.get('/api/rides')).json()).rides[0];
  const detail = await (
    await page.request.get(`/api/rides/${saved.id}`)
  ).json();
  expect(detail.speedProcessing.version).toBe('speed-1');
  expect(
    detail.speedProcessing.samples.some(
      (s: { source: string }) => s.source === 'assisted',
    ),
  ).toBe(true);
  expect(detail.ride.maximum_kmh).toBe(36);
  expect(detail.points.every((p: { speed: number }) => p.speed === 10)).toBe(
    true,
  );
});
test('três modos: preparação, pausa, navegação, resumo e persistência com GPS simulado', async ({
  page,
}) => {
  const bikes = await prepare(page);
  await expect(page.getByLabel('Moto da garagem')).toHaveValue(bikes[0]!);
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  for (const mode of ['passeio', 'pista', 'misto']) {
    const startsBefore = await page.evaluate(() => window.__gpsTest.starts);
    await page.getByLabel('Moto da garagem').selectOption(bikes[1]!);
    await chooseOption(page, 'Modo de pilotagem', mode);
    const posts: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/api/rides'))
        posts.push(req.postData()!);
    });
    await begin(page);
    expect(
      await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);
    await expect(
      page.getByRole('radiogroup', { name: 'Modo de pilotagem', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.ride-mode-choices')).toContainText(
      mode === 'passeio' ? 'Passeio' : mode === 'pista' ? 'Pista' : 'Misto',
    );
    await page.waitForTimeout(1100);
    await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.7349 }));
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect(page.locator('.preview-state')).toHaveText('Pausado');
    await page.waitForTimeout(1100);
    const time = await page
      .getByText('Tempo de ride', { exact: true })
      .locator('..')
      .textContent();
    expect(await page.evaluate(() => window.__gpsTest.active())).toBe(0);
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await nav.getByRole('link', { name: 'Explorar', exact: true }).click();
    await expect(
      page.getByRole('link', { name: /Ride pausado/ }),
    ).toBeVisible();
    await nav.getByRole('link', { name: 'Ride', exact: true }).click();
    await expect(page.locator('.preview-state')).toHaveText('Pausado');
    expect(
      await page
        .getByText('Tempo de ride', { exact: true })
        .locator('..')
        .textContent(),
    ).toBe(time);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.734 }));
    await expect(page.locator('.preview-state')).toHaveText('Em andamento');
    await nav.getByRole('link', { name: 'Explorar', exact: true }).click();
    expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
    await nav.getByRole('link', { name: 'Ride', exact: true }).click();
    await expect(page.locator('.preview-state')).toHaveText('Em andamento');
    expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(
      startsBefore + 2,
    );
    await finish(page);
    expect(posts).toHaveLength(0);
    await expect(
      page
        .getByRole('radiogroup', {
          name: 'Visibilidade da atividade',
          exact: true,
        })
        .getByRole('radio', { name: 'Privado', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByText(/3 pontos GPS aceitos · 2 segmentos/),
    ).toBeVisible();
    await expect(page.getByLabel('Início do percurso')).toBeVisible();
    await expect(page.getByLabel('Fim do percurso')).toBeVisible();
    await chooseOption(page, 'Visibilidade da atividade', 'public');
    await page
      .getByRole('button', { name: 'Salvar atividade', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Atividade salva com sucesso.',
    );
    expect(posts).toHaveLength(1);
    const list = await page.request.get('/api/rides');
    const saved = (await list.json()).rides[0];
    expect(saved.mode).toBe(mode);
    expect(saved.visibility).toBe('public');
    expect(saved.motorcycle_id).toBe(bikes[1]);
    const detail = await page.request.get(`/api/rides/${saved.id}`);
    expect((await detail.json()).points).toHaveLength(3);
    expect(saved.distance_meters).toBeLessThan(20);
    await page.getByRole('button', { name: 'Preparar novo Ride' }).click();
  }
});
test('falha após commit permite repetir sem duplicar; confirmação e descarte', async ({
  page,
}) => {
  await prepare(page);
  await begin(page);
  await page.waitForTimeout(50);
  await finish(page);
  let first = true;
  await page.route('**/api/rides', async (route) => {
    if (route.request().method() === 'POST' && first) {
      first = false;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  const syncPanel = page.getByRole('region', {
    name: 'Armazenamento e sincronização',
  });
  await syncPanel.locator('summary').click();
  await expect(syncPanel).toContainText('Erro temporário de sincronização');
  await expect(page.getByLabel('Visibilidade da atividade')).toBeDisabled();
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Atividade salva com sucesso.',
  );
  expect(
    (await (await page.request.get('/api/rides')).json()).rides,
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Preparar novo Ride' }).click();
  await begin(page);
  await page.waitForTimeout(50);
  await finish(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('button', { name: 'Descartar atividade', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Resumo da atividade' }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Descartar atividade', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Prepare seu Ride' }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/rides')).json()).rides,
  ).toHaveLength(1);
});
test('sem moto orienta cadastro e GPS negado não inicia sessão', async ({
  page,
}) => {
  await prepare(page, false);
  await expect(
    page.getByRole('link', { name: 'Cadastre uma moto para iniciar' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Iniciar Ride' }),
  ).toBeDisabled();
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(
    (
      await page.request.post('/api/motorcycles', {
        headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
        data: {
          brand: 'Honda',
          model: 'CB 650R',
          year: 2024,
          displacementCc: 649,
        },
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Iniciar Ride' }).click();
  await page.evaluate(() => window.__gpsTest.fail(1));
  await expect(page.getByRole('alert')).toContainText(
    'Localização não autorizada',
  );
  await begin(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await expect(page.locator('.preview-state')).toHaveText('Em andamento');
});
test('preparação e resumo responsivos preservam navegação e design', async ({
  page,
}) => {
  await prepare(page);
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/ride-preparation-${width}.png`,
      fullPage: true,
    });
  }
  await begin(page);
  await page.waitForTimeout(50);
  await finish(page);
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const map = await page
      .getByRole('region', { name: 'Mapa do percurso completo' })
      .boundingBox();
    const summary = await page
      .getByRole('region', { name: 'Resumo da atividade' })
      .boundingBox();
    expect(map!.width).toBeGreaterThan(summary!.width * 0.75);
    const columns = await page
      .locator('.session-summary-metrics > div')
      .evaluateAll((items) =>
        items.map((i) => i.getBoundingClientRect().width),
      );
    expect(columns.every((value) => value >= 85)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/ride-summary-${width}.png`,
      fullPage: true,
    });
  }
  expect(
    await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link')
      .count(),
  ).toBe(5);
});

test('sensores simulados: gesto iPhone, calibração, G, pausa, resumo e PostgreSQL', async ({
  page,
}) => {
  await mockMotion(page);
  await prepare(page);
  await openRideSetting(page, 'motion');
  await openRideSetting(page, 'calibration');
  const sensors = page.getByRole('region', { name: 'Sensores de movimento' });
  expect(await page.evaluate(() => window.__motionTest.requests)).toEqual([]);
  await sensors.getByRole('button', { name: 'Ativar Sensores' }).click();
  expect(await page.evaluate(() => window.__motionTest.requests)).toEqual([
    'motion',
    'orientation',
  ]);
  await page.evaluate(() => window.__motionTest.start());
  await expect(sensors.getByRole('status')).toContainText(
    'Sensores funcionando',
  );
  await sensors
    .getByLabel('Celular firmemente fixado no suporte indicado')
    .check();
  await sensors
    .getByLabel('Confirmo que a moto está parada e vertical')
    .check();
  await sensors
    .getByRole('button', { name: 'Calibrar sensores', exact: true })
    .click();
  await expect(
    sensors.getByRole('button', { name: 'Recalibrar sensores' }),
  ).toBeEnabled({ timeout: 6000 });
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/motion-calibrated-${width}.png`,
    });
  }
  await begin(page);
  await page.evaluate(() => window.__motionTest.acceleration(9.80665));
  await expect(page.locator('.force-grid .metric-card').first()).toContainText(
    '1.00',
    { timeout: 6000 },
  );
  await expect(page.locator('.lean-grid')).toContainText('—');
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(page.locator('.force-grid .metric-card').first()).toContainText(
    '—',
  );
  await page.evaluate(() => window.__motionTest.acceleration(0));
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await page.evaluate(() => window.__motionTest.acceleration(-9.80665));
  await expect(page.locator('.force-grid .metric-card').last()).toContainText(
    '1.00',
    { timeout: 6000 },
  );
  await finish(page);
  const summary = page.getByRole('region', { name: 'Resumo da atividade' });
  await expect(summary).toContainText('Inclinação dinâmica indisponível');
  let sent: Record<string, unknown> | null = null;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/rides'))
      sent = req.postDataJSON();
  });
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Atividade salva com sucesso.',
  );
  expect(sent).not.toBeNull();
  const saved = (await (await page.request.get('/api/rides')).json()).rides[0];
  const detail = await (
    await page.request.get(`/api/rides/${saved.id}`)
  ).json();
  expect(detail.motion.samples.length).toBeGreaterThan(5);
  expect(detail.motion.stats.maxAccelerationG).toBeGreaterThan(0.98);
  expect(detail.motion.stats.maxBrakingG).toBeGreaterThan(0.98);
  expect(detail.motion.stats.meanLeft).toBeNull();
  expect(detail.motion.calibration.valid).toBe(true);
  expect(
    new Set(detail.motion.samples.map((s: { segment: number }) => s.segment))
      .size,
  ).toBe(2);
  await page.evaluate(() => window.__motionTest.stop());
});

test('permissão de movimento negada permite sessão GPS e resumo sem valores artificiais', async ({
  page,
}) => {
  await mockMotion(page, true);
  await prepare(page);
  await openRideSetting(page, 'motion');
  await openRideSetting(page, 'calibration');
  const sensors = page.getByRole('region', { name: 'Sensores de movimento' });
  await sensors.getByRole('button', { name: 'Ativar Sensores' }).click();
  await expect(sensors.getByRole('status')).toContainText(
    'Permissão de movimento negada',
  );
  await begin(page);
  await page.waitForTimeout(50);
  await finish(page);
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Atividade salva com sucesso.',
  );
  const saved = (await (await page.request.get('/api/rides')).json()).rides[0];
  expect(
    (await (await page.request.get(`/api/rides/${saved.id}`)).json()).motion,
  ).toBeNull();
});
