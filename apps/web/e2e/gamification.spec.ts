import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepare } from './ride-fixtures';
test.describe.configure({ mode: 'serial' });
async function write(
  page: Page,
  path: string,
  method: 'post' | 'patch' | 'delete',
  data: unknown = {},
) {
  const me = await (await page.request.get('/api/auth/me')).json();
  return page.request[method](`/api${path}`, {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data,
  });
}
async function seed(page: Page, bike: string) {
  const start = Date.now() - 180000,
    body = {
      clientId: crypto.randomUUID(),
      motorcycleId: bike,
      mode: 'passeio',
      visibility: 'private',
      startedAt: start,
      endedAt: start + 120000,
      intervals: [{ start, end: start + 120000 }],
      points: Array.from({ length: 61 }, (_, i) => ({
        latitude: -9.665,
        longitude: -35.735 + i * 0.00003,
        timestamp: start + i * 2000,
        accuracy: 8,
        speed: 2,
        heading: 90,
        altitude: null,
        segment: 0,
      })),
    };
  const r = await write(page, '/rides', 'post', body);
  expect(r.status(), await r.text()).toBe(201);
  return { id: (await r.json()).id as string, body };
}
test('21E perfil real, conquista, histórico e exclusão sem duplicação', async ({
  page,
}) => {
  const bikes = await prepare(page);
  await page.goto('/perfil');
  await expect(page.getByText('Nível 1 · 0 XP', { exact: true })).toBeVisible();
  const ride = await seed(page, bikes[0]!);
  await write(page, '/rides', 'post', ride.body);
  await page.reload();
  await expect(
    page.getByText('Nível 2 · 120 XP', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Histórico de XP', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Histórico de XP', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.xp-entry')).toHaveCount(2);
  await page.goto('/perfil/conquistas');
  const first = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Primeiros passos', exact: true }),
  });
  await expect(first).toContainText('Desbloqueada');
  await page.goto(`/historico/${ride.id}`);
  await expect(
    page.getByText('120 XP confirmados nesta atividade', { exact: true }),
  ).toBeVisible();
  expect((await write(page, `/rides/${ride.id}`, 'delete')).status()).toBe(200);
  await page.goto('/perfil/xp');
  await expect(page.getByText('Nível 1 · 0 XP', { exact: true })).toBeVisible();
  await expect(page.locator('.xp-entry')).toHaveCount(4);
});
test('21E meta opcional, prévia e compartilhamento seguro de conquista', async ({
  page,
}) => {
  const bikes = await prepare(page);
  await page.goto('/perfil/conquistas');
  await page
    .getByRole('button', { name: 'Uma atividade elegível', exact: true })
    .click();
  await expect(
    page.getByText('Meta iniciada. Sem prazo ou obrigação diária.', {
      exact: true,
    }),
  ).toBeVisible();
  await seed(page, bikes[0]!);
  await page.reload();
  await expect(
    page.getByText('1 de 1 · Concluída', { exact: true }),
  ).toBeVisible();
  const first = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Primeiros passos', exact: true }),
  });
  await first
    .getByRole('button', { name: 'Compartilhar conquista', exact: true })
    .click();
  await page
    .getByRole('radiogroup',{name:'Público da publicação',exact:true})
    .getByRole('radio',{name:'Somente eu',exact:true}).check();
  await page
    .getByRole('button', { name: 'Visualizar prévia', exact: true })
    .click();
  await expect(
    page.getByText(
      'Conquista verificada pelo servidor · Sem detalhes de origem',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Criar publicação' }),
  ).toHaveCount(0);
  const me = await (await page.request.get('/api/auth/me')).json();
  const posts = (
    await (
      await page.request.get(`/api/social/users/${me.user.username}/posts`)
    ).json()
  ).items;
  expect(
    posts.some(
      (p: { achievement?: { code: string } }) =>
        p.achievement?.code === 'first_ride',
    ),
  ).toBe(true);
});
test('21E consentimento explícito, classificação e revogação preservam XP', async ({
  page,
}) => {
  const bikes = await prepare(page);
  await seed(page, bikes[0]!);
  await page.goto('/comunidade/rankings');
  await expect(
    page.getByText(
      'Participação desativada. Seu progresso pessoal continua disponível no Perfil.',
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByLabel('Participar dos rankings públicos', { exact: true })
    .check();
  await page
    .getByLabel('Li e confirmo estas escolhas de divulgação.', { exact: true })
    .check();
  await page
    .getByRole('button', {
      name: 'Salvar participação e privacidade',
      exact: true,
    })
    .click();
  await expect(page.locator('.ranking-list li')).toHaveCount(1);
  await expect(
    page.getByText('Meu posicionamento: 1º · 120 XP nesta classificação.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Participar dos rankings públicos', { exact: true })
    .uncheck();
  await page
    .getByRole('button', {
      name: 'Salvar participação e privacidade',
      exact: true,
    })
    .click();
  await expect(page.locator('.ranking-list li')).toHaveCount(0);
  await page.goto('/perfil');
  await expect(
    page.getByText('Nível 2 · 120 XP', { exact: true }),
  ).toBeVisible();
});
test('21E responsividade Racing Tech preserva cinco abas em seis larguras', async ({
  page,
}) => {
  test.setTimeout(90000);
  const bikes = await prepare(page);
  await seed(page, bikes[0]!);
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const path of [
    '/perfil',
    '/perfil/conquistas',
    '/perfil/xp',
    '/comunidade/rankings',
  ]) {
    await page.goto(path);
    if (path === '/perfil' || path === '/perfil/xp')
      await expect(
        page.getByText('Nível 2 · 120 XP', { exact: true }),
      ).toBeVisible();
    if (path === '/perfil/conquistas')
      await expect(
        page.getByRole('heading', { name: 'Primeiros passos', exact: true }),
      ).toBeVisible();
    if (path === '/comunidade/rankings')
      await expect(
        page.getByText('Nenhum participante elegível nesta seleção.', {
          exact: true,
        }),
      ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Navegação principal' })
        .getByRole('link'),
    ).toHaveCount(5);
    for (const width of [320, 360, 375, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: `../../.local/screenshots/parte21-${path.replaceAll('/', '-')}-${width}.png`,
          fullPage: true,
        });
    }
  }
});
test('21E ausência de rede não apresenta ranking antigo como atual', async ({
  page,
  context,
}) => {
  await prepare(page);
  await page.goto('/comunidade/rankings');
  await expect(
    page.getByRole('heading', {
      name: 'Privacidade da progressão',
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(
    page.getByText('Sem conexão, a classificação remota fica indisponível.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.ranking-list')).toHaveCount(0);
  await context.setOffline(false);
  await expect(
    page.getByText('Sem conexão, a classificação remota fica indisponível.', {
      exact: true,
    }),
  ).toHaveCount(0);
});
