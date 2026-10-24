import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepare, begin, finish } from './ride-fixtures';
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

test('Parte 16: câmera sintética, MediaRecorder nativo, pausa, offline, cópia e recuperação local', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const uploaded: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/') && r.method() === 'POST')
      uploaded.push(r.postData() ?? '');
  });
  await prepare(page);
  const config = page.getByRole('region', { name: 'Configuração de vídeo' });
  await expect(
    config.getByText('Vídeo desativado', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.querySelector<HTMLVideoElement>('video')?.srcObject ?? null,
    ),
  ).toBeNull();
  await page
    .getByRole('button', { name: 'Ativar vídeo e abrir prévia' })
    .click();
  await expect(
    config.getByText('Prévia disponível', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          document.querySelector<HTMLVideoElement>('video')
            ?.srcObject as MediaStream
        )?.getAudioTracks().length,
    ),
  ).toBe(0);
  await begin(page);
  await expect(
    config.getByText('REC · Gravando', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(2300);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(
    config.getByText('Vídeo pausado', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Câmera do vídeo' })
    .selectOption('user');
  await page
    .getByRole('button', { name: 'Ativar vídeo e abrir prévia' })
    .click();
  await expect(
    config.getByText('Prévia disponível', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await expect(
    config.getByText('REC · Gravando', { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.waitForTimeout(2300);
  await finish(page);
  const library = page.getByRole('region', { name: 'Vídeos desta atividade' });
  await expect(
    library.getByRole('heading', {
      name: 'Segmento 2 · Finalizado',
      exact: true,
    }),
  ).toBeVisible();
  await library
    .getByRole('button', { name: 'Assistir vídeo 1', exact: true })
    .click();
  const player = library.getByLabel('Vídeo local 1');
  await expect(player).toBeVisible();
  await expect
    .poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(1);
  const download = page.waitForEvent('download');
  await library
    .getByRole('link', { name: /Salvar cópia deste segmento/ })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(
    page.getByText(
      'Atividade salva no aparelho. Acompanhe a confirmação na seção de sincronização.',
    ),
  ).toBeVisible();
  await context.setOffline(false);
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.goto('/historico');
  await page.getByRole('button', { name: /Gravação local 1/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Segmento 2 · Finalizado', exact: true }),
  ).toBeVisible();
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/video-history-${width}.png`,
      fullPage: true,
    });
  }
  expect(
    uploaded.some((body) =>
      /video_segments|video_chunks|"blob"|"mimeType"/.test(body),
    ),
  ).toBe(false);
  const originalUser = (await (await page.request.get('/api/auth/me')).json())
    .user;
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/rides')).json()).rides.length,
      { timeout: 15000 },
    )
    .toBe(1);
  const rideId = (await (await page.request.get('/api/rides')).json()).rides[0]
    .id;
  await page.goto(`/historico/${rideId}`);
  await expect(
    page.getByRole('heading', { name: 'Segmento 2 · Finalizado', exact: true }),
  ).toBeVisible();
  await prepare(page); // Another test account in the same browser/IndexedDB.
  await page.goto('/historico');
  await expect(
    page.getByRole('heading', { name: 'Histórico de Rides', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Gravação local 1/ }),
  ).toHaveCount(0);
  const login = await page.request.post('/api/auth/login', {
    headers: { 'X-Apex-Request': '1' },
    data: {
      email: originalUser.email,
      password: 'senha longa para testar as sessoes',
    },
  });
  expect(login.status()).toBe(200);
  await page.goto(`/historico/${rideId}`);
  await expect(
    page.getByRole('heading', { name: 'Segmento 2 · Finalizado', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Excluir vídeos locais desta atividade',
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Gravação não disponível neste dispositivo/),
  ).toBeVisible();
  expect((await page.request.get(`/api/rides/${rideId}`)).status()).toBe(200);
});

test('Parte 16: acesso negado mantém Ride e descarte sem vídeo; configuração responsiva', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        throw new DOMException('negado', 'NotAllowedError');
      },
    });
  });
  await prepare(page);
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/video-prepare-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole('button', { name: 'Ativar vídeo e abrir prévia' })
    .click();
  await expect(page.getByText(/Permissão negada/)).toBeVisible();
  await begin(page);
  await finish(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Descartar atividade', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Iniciar Ride', exact: true }),
  ).toBeEnabled();
});
