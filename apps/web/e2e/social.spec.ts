import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepare } from './ride-fixtures';
test.describe.configure({ mode: 'serial' });
async function me(page: Page) {
  return (await page.request.get('/api/auth/me')).json();
}
async function write(
  page: Page,
  path: string,
  method: 'post' | 'delete' | 'patch',
  data?: unknown,
) {
  const s = await me(page);
  return page.request[method]('/api' + path, {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': s.csrfToken },
    ...(data === undefined ? {} : { data }),
  });
}
async function capture(page: Page, name: string) {
  await mkdir('../../.local/screenshots', { recursive: true });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({
    path: `../../.local/screenshots/${name}.png`,
    fullPage: true,
  });
}
test('18E texto, foto, moto, curtida, comentário, edição, falha de rede e exclusão', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const bikes = await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/comunidade');
  await page
    .getByRole('button', { name: 'Criar publicação', exact: true })
    .click();
  await page
    .getByLabel('Texto da publicação', { exact: true })
    .fill('Passeio real com fotografia');
  await page.getByLabel('Público da publicação').selectOption('public');
  await page
    .getByLabel('Associar moto', { exact: true })
    .selectOption(bikes[0]!);
  // A real image from the existing assets is uploaded only into the isolated test schema.
  await page
    .getByLabel('Fotografias', { exact: true })
    .setInputFiles('public/assets/sunset-bike.webp');
  await expect(page.getByAltText('Prévia local da fotografia')).toBeVisible();
  await page
    .getByRole('button', { name: 'Visualizar prévia', exact: true })
    .click();
  await capture(page, 'social-composer-390');
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  const post = page
    .locator('article.post')
    .filter({ hasText: 'Passeio real com fotografia' });
  await expect(post).toBeVisible();
  await expect(post.locator('.post-photo')).toBeVisible();
  await expect(post).toContainText('CB 650R');
  await post
    .getByRole('button', { name: 'Curtir publicação', exact: true })
    .click();
  await expect(
    post.getByRole('button', { name: 'Curtir publicação', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await context.setOffline(true);
  await post
    .getByRole('button', { name: 'Curtir publicação', exact: true })
    .click();
  await expect(post.getByRole('alert')).toContainText(
    'Não foi possível conectar',
  );
  await expect(
    post.getByRole('button', { name: 'Curtir publicação', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await context.setOffline(false);
  await post.getByRole('button', { name: /comentários/ }).click();
  await post
    .getByLabel('Escrever comentário')
    .fill('<script>alert(1)</script> texto literal');
  await post
    .getByRole('button', { name: 'Enviar comentário', exact: true })
    .click();
  await expect(post.locator('.comment')).toContainText(
    '<script>alert(1)</script> texto literal',
  );
  expect(await post.locator('script').count()).toBe(0);
  await capture(page, 'social-comments-390');
  await post
    .getByRole('button', { name: 'Excluir comentário', exact: true })
    .click();
  await expect(post.locator('.comment')).toHaveCount(0);
  await post
    .getByRole('button', { name: 'Opções da publicação', exact: true })
    .click();
  await post
    .getByRole('button', { name: 'Editar publicação', exact: true })
    .click();
  await page
    .getByLabel('Texto da publicação', { exact: true })
    .fill('Legenda editada no servidor');
  await page
    .getByRole('button', { name: 'Salvar publicação', exact: true })
    .click();
  const edited = page
    .locator('article.post')
    .filter({ hasText: 'Legenda editada no servidor' });
  await expect(edited).toBeVisible();
  await page
    .getByRole('button', { name: 'Criar publicação', exact: true })
    .click();
  await page
    .getByLabel('Texto da publicação', { exact: true })
    .fill('Rascunho preservado');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(
    page.getByLabel('Texto da publicação', { exact: true }),
  ).toHaveValue('Rascunho preservado');
  await expect(
    page.getByRole('region', { name: 'Criar publicação' }).getByRole('alert'),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await edited
    .getByRole('button', { name: 'Opções da publicação', exact: true })
    .click();
  await edited
    .getByRole('button', { name: 'Excluir publicação', exact: true })
    .click();
  await edited
    .getByRole('button', { name: 'Confirmar exclusão', exact: true })
    .click();
  await expect(edited).toHaveCount(0);
});
test('18E duas contas, solicitação privada, aprovação, listas, denúncia e bloqueio', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await prepare(page, false);
  const a = await me(page);
  await write(page, '/users/me/privacy', 'patch', {
    profileVisibility: 'private',
  });
  await write(page, '/social/posts', 'post', {
    text: 'Publicação privada para seguidores',
    visibility: 'followers',
  });
  const other = await browser.newContext();
  const b = await other.newPage();
  await b.setViewportSize({ width: 320, height: 900 });
  await prepare(b, false);
  const bs = await me(b);
  await b.goto(`/comunidade/u/${a.user.username}`);
  await expect(
    b.getByText(
      'Perfil privado. Uma solicitação pendente não libera publicações ou listas.',
    ),
  ).toBeVisible();
  await b
    .getByRole('button', { name: 'Solicitar seguir', exact: true })
    .click();
  await expect(
    b.getByRole('button', { name: 'Cancelar solicitação', exact: true }),
  ).toBeVisible();
  await expect(b.locator('article.post')).toHaveCount(0);
  expect(
    await b.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await capture(b, 'social-private-profile-320');
  await page.goto('/comunidade');
  await page
    .getByRole('button', { name: 'Solicitações recebidas', exact: true })
    .click();
  await page.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect(page.getByText('Nenhuma conta nesta lista.')).toBeVisible();
  await b.reload();
  await expect(b.locator('article.post')).toContainText(
    'Publicação privada para seguidores',
  );
  await capture(b, 'social-approved-profile-320');
  await b.getByRole('button', { name: '1 seguidores', exact: true }).click();
  await expect(b.locator('.social-people')).toContainText(bs.user.username);
  await b.getByRole('button', { name: 'Publicações', exact: true }).click();
  await b
    .locator('article.post')
    .getByRole('button', { name: 'Opções da publicação', exact: true })
    .click();
  await b
    .locator('article.post')
    .getByRole('button', { name: 'Denunciar', exact: true })
    .click();
  await b.getByRole('button', { name: 'Enviar denúncia', exact: true }).click();
  await expect(
    b.getByText('Denúncia recebida para análise.', { exact: true }),
  ).toBeVisible();
  await page.goto(`/comunidade/u/${bs.user.username}`);
  await page
    .getByRole('button', { name: 'Bloquear usuário', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirmar bloqueio', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Conteúdo indisponível');
  await b.reload();
  await expect(b.getByRole('alert')).toContainText('Conteúdo indisponível');
  await page.goto('/comunidade');
  await page
    .getByRole('button', { name: 'Contas bloqueadas', exact: true })
    .click();
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(page.getByText('Nenhuma conta nesta lista.')).toBeVisible();
  await other.close();
});
test('18E Histórico prepara resumo sem publicar, privacidade revoga, responsividade Racing Tech', async ({
  page,
}) => {
  test.setTimeout(90000);
  const bikes = await prepare(page);
  const start = Date.now() - 60000;
  const result = await write(page, '/rides', 'post', {
    clientId: crypto.randomUUID(),
    motorcycleId: bikes[0],
    mode: 'passeio',
    visibility: 'public',
    startedAt: start,
    endedAt: start + 10000,
    intervals: [{ start, end: start + 10000 }],
    points: [0, 1, 2].map((i) => ({
      longitude: -35.735 + i * 0.0001,
      latitude: -9.665,
      timestamp: start + i * 1000,
      accuracy: 5,
      speed: 10,
      heading: 90,
      altitude: null,
      segment: 0,
    })),
  });
  expect(result.status()).toBe(201);
  const ride = await result.json();
  await page.goto('/historico/' + ride.id);
  await page
    .getByRole('link', { name: 'Compartilhar na Comunidade', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Criar publicação' }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/social/feed')).json()).items,
  ).toEqual([]);
  await page
    .getByLabel('Texto da publicação', { exact: true })
    .fill('Meu resumo seguro');
  await page.getByLabel('Público da publicação').selectOption('public');
  await page
    .getByRole('button', { name: 'Visualizar prévia', exact: true })
    .click();
  await expect(page.getByText(/Sem GPS/)).toBeVisible();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  const post = page
    .locator('article.post')
    .filter({ hasText: 'Meu resumo seguro' });
  await expect(post).toContainText(
    'Resumo sem mapa, GPS ou telemetria detalhada.',
  );
  await mkdir('../../.local/screenshots', { recursive: true });
  for (const width of [320, 360, 375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page
        .getByRole('navigation', { name: 'Navegação principal' })
        .getByRole('link'),
    ).toHaveCount(5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await capture(page, `social-${width}`);
  }
  await write(page, `/rides/${ride.id}`, 'patch', {
    title: 'Ride privado',
    description: '',
    visibility: 'private',
  });
  await page.reload();
  await expect(page.locator('article.post')).toContainText(
    'Resumo do Ride indisponível',
  );
  expect(
    (await page.request.get(`/api/public/rides/${ride.id}`)).status(),
  ).toBe(404);
});
