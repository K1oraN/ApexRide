import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepare, begin, finish } from './ride-fixtures';
test.describe.configure({ mode: 'serial' });
async function write(
  page: Page,
  path: string,
  method: 'post' | 'patch' | 'delete',
  data: unknown = {},
) {
  const me = await (await page.request.get('/api/auth/me')).json();
  return page.request[method]('/api' + path, {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data,
  });
}
async function create(page: Page, extra: Record<string, unknown> = {}) {
  const r = await write(page, '/events', 'post', {
    creationKey: crypto.randomUUID(),
    title: 'Encontro sintético navegador',
    eventType: 'meetup',
    visibility: 'public',
    joinPolicy: 'immediate',
    description: 'Dados somente no esquema de testes',
    rules: 'Moto parada durante o teste',
    city: 'Maceió',
    state: 'AL',
    meetingPoint: [-35.735, -9.665],
    meetingPointLabel: 'Ponto sintético',
    startsAt: new Date(Date.now() - 10000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    timezone: 'America/Maceio',
    confirmPoint: true,
    ...extra,
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).event;
}
async function capture(page: Page, name: string) {
  await mkdir('../../.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `../../.local/screenshots/${name}.png`,
    fullPage: true,
  });
}
async function consent(page: Page) {
  await page
    .getByLabel(
      'Autorizo compartilhar minha localização neste evento com o público, prazo e precisão acima.',
    )
    .check();
  await page
    .getByRole('button', { name: 'Ativar localização ao vivo', exact: true })
    .click();
  await expect(
    page
      .getByRole('button', { name: 'Parar compartilhamento', exact: true })
      .first(),
  ).toBeVisible();
}
test('20A criação, imagem, revisão, edição, descoberta regional e design responsivo', async ({
  page,
}) => {
  test.setTimeout(90000);
  await prepare(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/comunidade');
  await page.getByRole('link', { name: 'Eventos', exact: true }).click();
  await page.getByRole('link', { name: 'Criar evento', exact: true }).click();
  await page
    .getByLabel('Nome do evento', { exact: true })
    .fill('Café de teste navegador');
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Reunião sintética em banco isolado');
  await page.getByLabel('Cidade', { exact: true }).fill('Maceió');
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Data e hora de início').fill(`${day}T09:00`);
  await page.getByLabel('Encerramento previsto').fill(`${day}T11:00`);
  await page.getByLabel('Nome do ponto de encontro').fill('Praça de teste');
  await page.getByLabel('Latitude', { exact: true }).fill('-9.665');
  await page.getByLabel('Longitude', { exact: true }).fill('-35.735');
  await page
    .getByLabel(
      'Confirmo que este ponto será divulgado ao público escolhido. Escolhi um local apropriado, acessível e autorizado.',
    )
    .check();
  await page
    .getByLabel('Imagem opcional')
    .setInputFiles('public/assets/sunset-bike.webp');
  await page
    .getByRole('button', { name: 'Revisar informações', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Revisão do evento' }),
  ).toContainText('09:00');
  await capture(page, 'events-review-390');
  await page
    .getByRole('button', { name: 'Confirmar criação', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Café de teste navegador', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.event-cover')).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  expect(await page.locator('.bottom-nav a').count()).toBe(5);
  for (const width of [320, 360, 375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture(page, `events-detail-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Editar evento', exact: true })
    .click();
  await page.getByLabel('Nome do evento').fill('Café atualizado navegador');
  await page
    .getByLabel(
      'Confirmo que este ponto será divulgado ao público escolhido. Escolhi um local apropriado, acessível e autorizado.',
    )
    .check();
  await page
    .getByRole('button', { name: 'Revisar informações', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirmar alterações', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Café atualizado navegador',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Voltar aos eventos', exact: true })
    .click();
  await page.getByLabel('Cidade', { exact: true }).fill('Maceió');
  await page
    .getByRole('combobox', { name: 'Estado', exact: true })
    .selectOption('AL');
  await expect(
    page.getByRole('link', { name: 'Café atualizado navegador', exact: true }),
  ).toBeVisible();
  await capture(page, 'events-discovery-390');
});
test('20C duas contas, consentimento separado, aproximada, parar, offline e nenhuma retomada automática', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await prepare(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  const e = await create(page);
  const bobContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:5174',
  });
  const bob = await bobContext.newPage();
  await prepare(bob, false);
  await bob.setViewportSize({ width: 390, height: 844 });
  await bob.goto(`/comunidade/eventos/${e.id}`);
  await bob
    .getByRole('button', { name: 'Confirmar presença', exact: true })
    .click();
  await expect(
    bob.getByText('Presença confirmada', { exact: true }),
  ).toBeVisible();
  expect(await bob.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await page.goto(`/comunidade/eventos/${e.id}/mapa`);
  await expect(
    page.getByRole('heading', {
      name: 'Posições autorizadas (0)',
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await bob
    .getByRole('link', { name: 'Abrir mapa social', exact: true })
    .click();
  await consent(bob);
  await bob.evaluate(() => window.__gpsTest.emit());
  await expect(
    page.getByRole('heading', {
      name: 'Posições autorizadas (1)',
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/precisão de 1600 m/)).toBeVisible();
  await capture(page, 'events-live-390');
  const raw = await (
    await page.request.get(`/api/events/${e.id}/live-location/participants`)
  ).json();
  expect(raw.items[0].precision_mode).toBe('approximate');
  expect(raw.items[0].longitude).toBe(-35.73);
  expect(raw.items[0].latitude).toBe(-9.66);
  await bob
    .getByRole('button', { name: 'Parar compartilhamento', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Posições autorizadas (0)',
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await consent(bob);
  await bobContext.setOffline(true);
  await expect(
    bob.getByRole('button', { name: 'Parar compartilhamento', exact: true }),
  ).toHaveCount(0);
  await bobContext.setOffline(false);
  await expect
    .poll(
      async () =>
        (
          await (
            await bob.request.get(`/api/events/${e.id}/live-location/me`)
          ).json()
        ).session,
    )
    .toBeNull();
  expect(await bob.evaluate(() => window.__gpsTest.active())).toBe(0);
  await bobContext.close();
});
test('20D Ride associado usa o mesmo GPS, parar social preserva sessão e finalizar revoga', async ({
  page,
}) => {
  test.setTimeout(90000);
  await prepare(page);
  const e = await create(page, { eventType: 'ride' });
  await page.goto(`/comunidade/eventos/${e.id}`);
  await page
    .getByRole('link', { name: 'Iniciar Ride neste passeio', exact: true })
    .click();
  await expect(
    page.getByRole('link', {
      name: 'Encontro sintético navegador',
      exact: true,
    }),
  ).toBeVisible();
  await begin(page);
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  const meBefore = await (
    await page.request.get(`/api/events/${e.id}/live-location/me`)
  ).json();
  expect(meBefore.session).toBeNull();
  await page.getByRole('link', { name: e.title, exact: true }).click();
  await page
    .getByRole('link', { name: 'Abrir mapa social', exact: true })
    .click();
  await consent(page);
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await page
    .getByRole('button', { name: 'Parar compartilhamento', exact: true })
    .first()
    .click();
  await page.locator('.bottom-nav a[href="/ride"]').click();
  await expect(page.locator('.preview-state')).toHaveText('Em andamento');
  expect(await page.evaluate(() => window.__gpsTest.active())).toBe(1);
  await page.getByRole('link', { name: e.title, exact: true }).click();
  await page
    .getByRole('link', { name: 'Abrir mapa social', exact: true })
    .click();
  await consent(page);
  await page.locator('.bottom-nav a[href="/ride"]').click();
  await page.evaluate(() => window.__gpsTest.emit({ longitude: -35.73499 }));
  await finish(page);
  await expect(
    page.getByRole('button', { name: 'Parar compartilhamento', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Salvar atividade', exact: true })
    .click();
  await expect(
    page.getByText('Atividade salva com sucesso.', { exact: false }),
  ).toBeVisible();
  const feed = await (await page.request.get('/api/social/feed')).json();
  expect(feed.items).toHaveLength(0);
});
test('20B evento privado, convite nominal, recusa e cancelamento não expõem localização', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await prepare(page, false);
  const e = await create(page, { visibility: 'invite' }),
    context = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' }),
    bob = await context.newPage();
  await prepare(bob, false);
  const who = await (await bob.request.get('/api/auth/me')).json();
  expect((await bob.request.get(`/api/events/${e.id}`)).status()).toBe(404);
  const invited = await write(page, `/events/${e.id}/invitations`, 'post', {
    userId: who.user.id,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  expect(invited.status()).toBe(200);
  await bob.goto('/comunidade/eventos');
  const accepted = bob.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/events/invitations/') &&
      r.url().endsWith('/accept'),
  );
  await bob
    .getByRole('button', { name: 'Aceitar convite', exact: true })
    .click();
  expect((await accepted).status()).toBe(200);
  await bob.goto(`/comunidade/eventos/${e.id}`);
  await expect(
    bob.getByText('Presença confirmada', { exact: true }),
  ).toBeVisible();
  expect(await bob.evaluate(() => window.__gpsTest.starts)).toBe(0);
  await page.goto(`/comunidade/eventos/${e.id}`);
  await page
    .getByRole('button', { name: 'Cancelar evento', exact: true })
    .click();
  const cancelled = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(`/events/${e.id}/cancel`),
  );
  await page
    .getByRole('button', { name: 'Confirmar cancelamento', exact: true })
    .click();
  expect((await cancelled).status()).toBe(200);
  await bob.reload();
  await expect(
    bob.getByText('ENCONTRO · Cancelado', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await bob.request.get(`/api/events/${e.id}/live-location/participants`)
    ).status(),
  ).toBe(403);
  await context.close();
});
