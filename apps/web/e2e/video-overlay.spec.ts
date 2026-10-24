import { chooseOption } from './choices';
import { openRideSetting } from './ride-settings';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { prepare, begin, finish } from './ride-fixtures';
test.use({
  actionTimeout: 10000,
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});
async function recorded(page: Page, audio = false, mp4 = false) {
  if (mp4)
    await page.addInitScript(() => {
      const native = MediaRecorder.isTypeSupported.bind(MediaRecorder);
      Object.defineProperty(MediaRecorder, 'isTypeSupported', {
        configurable: true,
        value: (mime: string) => mime.startsWith('video/mp4') && native(mime),
      });
      window.addEventListener(
        'restore-codecs',
        () =>
          Object.defineProperty(MediaRecorder, 'isTypeSupported', {
            configurable: true,
            value: native,
          }),
        { once: true },
      );
    });
  await prepare(page);
  await openRideSetting(page, 'video');
  if (audio) await page.getByLabel('Gravar áudio (solicita microfone)').check();
  await page
    .getByRole('button', { name: 'Ativar vídeo e abrir prévia' })
    .click();
  const config = page.getByRole('region', { name: 'Configuração de vídeo' });
  await expect(
    config.getByText('Prévia disponível', { exact: true }),
  ).toBeVisible();
  await begin(page);
  await expect(
    config.getByText('REC · Gravando', { exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(650);
    await page.evaluate(() => window.__gpsTest.emit());
  }
  await finish(page);
  if (mp4)
    await page.evaluate(() =>
      window.dispatchEvent(new Event('restore-codecs')),
    );
  await page
    .getByRole('button', { name: 'Assistir com telemetria · 1', exact: true })
    .click();
  const player = page.getByRole('region', { name: 'Telemetria do segmento 1' });
  await expect(
    player.getByRole('button', { name: 'Reproduzir vídeo', exact: true }),
  ).toBeEnabled();
  return player;
}
test('17: gravação da Parte 16, prévia offline, ajustes, cancelamento, WebM/MP4 reais e frames compostos', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/') && r.method() === 'POST')
      uploads.push(r.postData() ?? '');
  });
  const player = await recorded(page);
  await context.setOffline(true);
  await player
    .getByRole('button', { name: 'Reproduzir vídeo', exact: true })
    .click();
  await expect
    .poll(() => player.getByRole('slider').inputValue())
    .not.toBe('0');
  await player
    .getByRole('button', { name: 'Pausar vídeo', exact: true })
    .click();
  await expect(
    player.getByRole('button', { name: 'Reproduzir vídeo', exact: true }),
  ).toBeVisible();
  const paused = await player.getByRole('slider').inputValue();
  await page.waitForTimeout(250);
  expect(await player.getByRole('slider').inputValue()).toBe(paused);
  await player.getByText('Configurar overlay', { exact: true }).click();
  await chooseOption(player, 'Layout', 'compact');
  await player.getByLabel('Velocidade de reprodução').selectOption('2');
  await player.getByRole('button', { name: '+0,1 s', exact: true }).click();
  await expect(player.getByText(/0.1 s · positivo/)).toBeVisible();
  await player
    .getByRole('button', { name: 'Restaurar sincronização original' })
    .click();
  await player
    .getByRole('button', { name: 'Salvar configuração local' })
    .click();
  await expect(
    player.getByText('Configuração salva neste aparelho.'),
  ).toBeVisible();
  await player.getByRole('slider').evaluate((node) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(node, '0.8');
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect
    .poll(() =>
      player
        .locator('video.overlay-source')
        .evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeCloseTo(0.8, 1);
  await player.getByLabel('Qualidade de exportação').selectOption('economy');
  const formats = await player
    .getByLabel('Formato de exportação', { exact: true })
    .locator('option')
    .evaluateAll((o) => o.map((n) => (n as HTMLOptionElement).value));
  expect(formats.some((m) => m.includes('webm'))).toBe(true);
  await player
    .getByRole('button', { name: 'Exportar vídeo com telemetria', exact: true })
    .click();
  await player.getByRole('button', { name: 'Cancelar exportação' }).click();
  await expect(player.getByText('Exportação: Cancelado')).toBeVisible();
  const containers = [
    formats.find((m) => m.includes('webm'))!,
    formats.find((m) => m.includes('mp4')),
  ].filter((m): m is string => !!m);
  for (const mime of containers) {
    await player
      .getByLabel('Formato de exportação', { exact: true })
      .selectOption(mime);
    await player
      .getByRole('button', {
        name: 'Exportar vídeo com telemetria',
        exact: true,
      })
      .click();
    await expect(player.getByText('Exportação: Concluído · 100%')).toBeVisible({
      timeout: 25000,
    });
    const result = player.getByLabel('Arquivo exportado com telemetria');
    await expect
      .poll(() => result.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(2);
    const visual = await result.evaluate(async (v: HTMLVideoElement) => {
      if (!Number.isFinite(v.duration)) {
        const end = new Promise<void>((resolve) =>
          v.addEventListener('seeked', () => resolve(), { once: true }),
        );
        v.currentTime = 1e10;
        await end;
      }
      v.currentTime = Math.min(0.8, v.duration / 2);
      await new Promise<void>((r) =>
        v.addEventListener('seeked', () => r(), { once: true }),
      );
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let red = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i]! > 170 && pixels[i + 1]! < 80 && pixels[i + 2]! < 90)
          red++;
      const scale = Math.min(c.width / 480, c.height / 270),
        cx = 90,
        cy = c.height / scale - 84;
      const score = (text: string) => {
        const e = document.createElement('canvas');
        e.width = c.width;
        e.height = c.height;
        const x = e.getContext('2d')!;
        x.scale(scale, scale);
        x.fillStyle = '#fff';
        x.textAlign = 'center';
        x.font = 'bold 44px "Roboto Condensed", sans-serif';
        x.fillText(text, cx, cy + 5);
        const expected = x.getImageData(0, 0, e.width, e.height).data;
        let overlap = 0,
          total = 0;
        for (let y = Math.floor((cy - 36) * scale); y < (cy + 12) * scale; y++)
          for (
            let a = Math.floor((cx - 45) * scale);
            a < (cx + 45) * scale;
            a++
          ) {
            const i = (y * c.width + a) * 4;
            const white =
              pixels[i]! > 170 && pixels[i + 1]! > 170 && pixels[i + 2]! > 170;
            const match = expected[i + 3]! > 150;
            if (white || match) total++;
            if (white && match) overlap++;
          }
        return overlap / Math.max(1, total);
      };
      return {
        red,
        width: v.videoWidth,
        height: v.videoHeight,
        duration: v.duration,
        recorded36: score('36'),
        doubled72: score('72'),
      };
    });
    expect(visual.red).toBeGreaterThan(50);
    expect(visual.width).toBeLessThanOrEqual(854);
    expect(visual.duration).toBeGreaterThan(2);
    expect(Number.isFinite(visual.duration)).toBe(true);
    // Native output pixels must show the recorded 36 km/h even after preview at 2×.
    expect(visual.recorded36).toBeGreaterThan(0.45);
    expect(visual.recorded36).toBeGreaterThan(visual.doubled72 + 0.15);
    await mkdir('../../.local/screenshots', { recursive: true });
    const evidencePath = `../../.local/screenshots/overlay-frames-${mime.includes('mp4') ? 'mp4' : 'webm'}.json`;
    await writeFile(
      evidencePath,
      JSON.stringify(
        {
          browser: page.context().browser()?.version(),
          requestedMime: mime,
          ...visual,
          result: await player
            .getByText(/Arquivo composto validado/)
            .innerText(),
        },
        null,
        2,
      ),
    );
    await test
      .info()
      .attach(`frames-${mime.includes('mp4') ? 'mp4' : 'webm'}.json`, {
        path: evidencePath,
        contentType: 'application/json',
      });
    const download = page.waitForEvent('download');
    await player
      .getByRole('link', { name: 'Salvar vídeo com telemetria', exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(
      mime.includes('mp4') ? /\.mp4$/ : /\.webm$/,
    );
  }
  await mkdir('../../.local/screenshots', { recursive: true });
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (const width of [320, 360, 375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await player.screenshot({
      path: `../../.local/screenshots/overlay-${width}.png`,
    });
  }
  await player
    .getByRole('link', { name: 'Salvar original sem overlay' })
    .click();
  expect(
    uploads.some((b) => /video_export|video_chunks|"blob"|"mimeType"/.test(b)),
  ).toBe(false);
});

test('17: fonte MP4 da Parte 16, erros do codificador, suspensão, persistência e integridade do original', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  test.skip(
    !(await page.evaluate(() => MediaRecorder.isTypeSupported('video/mp4'))),
    'Codificador MP4 indisponível neste Chrome.',
  );
  const player = await recorded(page, false, true);
  const originalDigest = () =>
    page.evaluate(async () => {
      const request = indexedDB.open('apex-ride-offline');
      const db = await new Promise<IDBDatabase>((res, rej) => {
        request.onsuccess = () => res(request.result);
        request.onerror = () => rej(request.error);
      });
      try {
        const req = db
          .transaction('video_chunks')
          .objectStore('video_chunks')
          .getAll();
        const rows = await new Promise<{ blob: Blob }[]>((res, rej) => {
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
        const bytes = await new Blob(rows.map((r) => r.blob)).arrayBuffer();
        return Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        ).join(',');
      } finally {
        db.close();
      }
    });
  const before = await originalDigest();
  await player.getByText('Configurar overlay', { exact: true }).click();
  await chooseOption(player, 'Layout', 'track');
  await player.getByRole('button', { name: '+0,1 s', exact: true }).click();
  await player
    .getByRole('button', { name: 'Salvar configuração local' })
    .click();
  await expect(
    player.getByText('Configuração salva neste aparelho.'),
  ).toBeVisible();
  await page.evaluate(() => {
    const Native = MediaRecorder;
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: new Proxy(Native, {
        construct() {
          throw new Error('Falha de codificador simulada');
        },
      }),
    });
    window.addEventListener(
      'restore-encoder',
      () =>
        Object.defineProperty(window, 'MediaRecorder', {
          configurable: true,
          value: Native,
        }),
      { once: true },
    );
  });
  await player
    .getByRole('button', { name: 'Exportar vídeo com telemetria', exact: true })
    .click();
  await expect(player.getByText('Exportação: Erro')).toBeVisible();
  await expect(player.getByText('Falha de codificador simulada')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('restore-encoder')));
  await player
    .getByRole('button', { name: 'Exportar vídeo com telemetria', exact: true })
    .click();
  await expect(player.getByRole('progressbar')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(
    player.getByText(/Exportação interrompida ao ocultar/),
  ).toBeVisible();
  await page.evaluate(() => {
    delete (document as unknown as { visibilityState?: string })
      .visibilityState;
  });
  expect(await originalDigest()).toBe(before);
  // Reopening the player restores only this file's saved configuration.
  await page
    .getByRole('button', { name: 'Fechar telemetria do vídeo' })
    .click();
  await page
    .getByRole('button', { name: 'Assistir com telemetria · 1', exact: true })
    .click();
  await player.getByText('Configurar overlay', { exact: true }).click();
  await expect(
    player
      .getByRole('radiogroup', { name: 'Layout', exact: true })
      .getByRole('radio', { name: 'Pista', exact: true }),
  ).toBeChecked();
  await expect(player.getByText(/0.1 s · positivo/)).toBeVisible();
  const formats = await player
    .getByLabel('Formato de exportação', { exact: true })
    .locator('option')
    .evaluateAll((o) => o.map((n) => (n as HTMLOptionElement).value));
  await player
    .getByLabel('Formato de exportação', { exact: true })
    .selectOption(formats.find((m) => m.includes('webm'))!);
  await player
    .getByRole('button', { name: 'Exportar vídeo com telemetria', exact: true })
    .click();
  await expect(player.getByText('Exportação: Concluído · 100%')).toBeVisible({
    timeout: 25000,
  });
  expect(await originalDigest()).toBe(before);
  await prepare(page);
  await openRideSetting(page, 'video');
  await page.goto('/historico');
  await expect(
    page.getByRole('button', { name: /Gravação local 1/ }),
  ).toHaveCount(0);
});

test('17: áudio original opt-in e fallback sem codificador mantém prévia e original', async ({
  page,
}) => {
  test.setTimeout(60000);
  const player = await recorded(page, true);
  await chooseOption(player, 'Áudio da exportação', 'original');
  const formats = await player
    .getByLabel('Formato de exportação', { exact: true })
    .locator('option')
    .evaluateAll((o) => o.map((n) => (n as HTMLOptionElement).value));
  await player
    .getByLabel('Formato de exportação', { exact: true })
    .selectOption(formats.find((m) => m.includes('webm'))!);
  await player
    .getByRole('button', { name: 'Exportar vídeo com telemetria', exact: true })
    .click();
  await expect(player.getByText('Exportação: Concluído · 100%')).toBeVisible({
    timeout: 25000,
  });
  await expect(
    player.getByText(/Arquivo composto validado.*Com trilha original/),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(MediaRecorder, 'isTypeSupported', {
      configurable: true,
      value: () => false,
    });
  });
  // Re-render capability detection without removing the original/preview.
  await chooseOption(player, 'Áudio da exportação', 'off');
  await expect(
    player.getByText(/Exportação composta indisponível para esta configuração/),
  ).toBeVisible();
  await expect(
    player.getByRole('button', {
      name: 'Exportar vídeo com telemetria sem áudio',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    player.getByRole('link', { name: 'Salvar original sem overlay' }),
  ).toBeVisible();
  await expect(
    player.getByRole('button', { name: 'Reproduzir vídeo', exact: true }),
  ).toBeEnabled();
});
