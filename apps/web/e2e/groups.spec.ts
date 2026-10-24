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
  return page.request[method]('/api' + path, {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken },
    data,
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
test('19E criar público, pesquisar, publicar foto/moto, curtir, comentar e preservar rascunho offline', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const bikes = await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/comunidade');
  await page.getByRole('link', { name: 'Grupos', exact: true }).click();
  await page.getByRole('link', { name: 'Criar grupo', exact: true }).click();
  await page
    .getByLabel('Nome do grupo', { exact: true })
    .fill('Motociclistas Teste Alagoas');
  await page.getByLabel('Descrição pública').fill('Grupo de teste isolado');
  await page.getByLabel('Cidade (opcional)').fill('Maceió');
  await page.getByLabel('Estado (opcional)').selectOption('AL');
  await page.getByLabel('Naked', { exact: true }).check();
  await page
    .getByLabel('Regras (uma por linha, até 20)')
    .fill('Respeite os integrantes');
  await page
    .getByLabel('Imagem de capa')
    .setInputFiles('public/assets/sunset-bike.webp');
  await page.getByRole('button', { name: 'Revisar informações' }).click();
  await capture(page, 'groups-create-390');
  await page.getByRole('button', { name: 'Confirmar criação' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Motociclistas Teste Alagoas',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.group-cover')).toBeVisible();
  const groupUrl = page.url();
  await page
    .getByRole('button', { name: 'Criar publicação', exact: true })
    .click();
  await page
    .getByLabel('Texto da publicação', { exact: true })
    .fill('Foto publicada no grupo');
  await page
    .getByLabel('Associar moto', { exact: true })
    .selectOption(bikes[0]!);
  await page
    .getByLabel('Fotografias', { exact: true })
    .setInputFiles('public/assets/sunset-bike.webp');
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  const post = page
    .locator('article.post')
    .filter({ hasText: 'Foto publicada no grupo' });
  await expect(post).toBeVisible();
  await expect(post.locator('.post-photo')).toBeVisible();
  await post
    .getByRole('button', { name: 'Curtir publicação', exact: true })
    .click();
  await expect(
    post.getByRole('button', { name: 'Curtir publicação', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await post.getByRole('button', { name: /comentários/ }).click();
  await post.getByLabel('Escrever comentário').fill('Comentário do grupo');
  await post
    .getByRole('button', { name: 'Enviar comentário', exact: true })
    .click();
  await expect(post.locator('.comment')).toContainText('Comentário do grupo');
  await page
    .getByRole('button', { name: 'Criar publicação', exact: true })
    .click();
  await page
    .getByLabel('Texto da publicação', { exact: true })
    .fill('Rascunho preservado');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Criar publicação' }).getByRole('alert'),
  ).toContainText('Não foi possível conectar');
  await expect(
    page.getByLabel('Texto da publicação', { exact: true }),
  ).toHaveValue('Rascunho preservado');
  await context.setOffline(false);
  await page
    .getByRole('region', { name: 'Criar publicação' })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  for (const width of [320, 360, 375, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture(page, `groups-detail-${width}`);
  }
  expect(await page.locator('.bottom-nav a').count()).toBe(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Voltar aos grupos' }).click();
  await page.getByLabel('Pesquisar grupos').fill('Motociclistas');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Estado', exact: true })
    .selectOption('AL');
  await expect(
    page.getByRole('link', {
      name: 'Motociclistas Teste Alagoas',
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, 'groups-discovery-390');
  await page.goto('/comunidade');
  await expect(
    page.locator('article.post').filter({ hasText: 'Foto publicada no grupo' }),
  ).toHaveCount(0);
  await page.goto(groupUrl);
});
test('19E privado: solicitação, aprovação, papéis, suspensão e perda de acesso após remoção', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await prepare(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  const create = await write(page, '/groups', 'post', {
    creationKey: crypto.randomUUID(),
    name: 'Privado Teste',
    description: 'Apresentação autorizada',
    privacyType: 'private',
    discoveryMode: 'listed',
    joinPolicy: 'approval',
    rules: ['Respeite a privacidade'],
  });
  expect(create.status()).toBe(201);
  const g = (await create.json()).group;
  await page.goto(`/comunidade/grupos/${g.id}`);
  await page
    .getByRole('button', { name: 'Criar publicação', exact: true })
    .click();
  await page
    .getByLabel('Texto da publicação', { exact: true })
    .fill('Conteúdo privado secreto');
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.locator('article.post')).toContainText(
    'Conteúdo privado secreto',
  );
  const other = await browser.newContext({
      baseURL: 'http://127.0.0.1:5174',
      viewport: { width: 390, height: 844 },
    }),
    member = await other.newPage();
  await prepare(member, false);
  const me = await (await member.request.get('/api/auth/me')).json();
  await member.goto(`/comunidade/grupos/${g.id}`);
  await expect(member.locator('article.post')).toHaveCount(0);
  await member.getByLabel('Li e aceito as regras atuais').check();
  await member
    .getByRole('button', { name: 'Solicitar entrada', exact: true })
    .click();
  await expect(
    member.getByText('Solicitação pendente', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Solicitações', exact: true }).click();
  await page.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect(
    page.getByText('Nenhum pedido pendente.', { exact: true }),
  ).toBeVisible();
  await member.reload();
  await expect(member.locator('article.post')).toContainText(
    'Conteúdo privado secreto',
  );
  await page.getByRole('button', { name: 'Membros', exact: true }).click();
  const target = page.locator('article.group-member').filter({
    has: page.getByRole('button', { name: 'Alterar cargo', exact: true }),
  });
  await target
    .getByRole('combobox', { name: 'Cargo', exact: true })
    .selectOption('moderator');
  await target
    .getByRole('button', { name: 'Alterar cargo', exact: true })
    .click();
  await expect(target.locator('p').first()).toContainText('Moderador');
  await member.reload();
  await expect(
    member.getByRole('button', { name: 'Denúncias', exact: true }),
  ).toBeVisible();
  expect(
    (
      await write(member, `/groups/${g.id}/transfer-ownership`, 'post', {
        userId: me.user.id,
        confirm: true,
      })
    ).status(),
  ).toBe(403);
  await target.getByLabel('Motivo da medida').fill('Revisão temporária');
  await target
    .getByRole('button', { name: 'Suspender membro', exact: true })
    .click();
  await expect(target).toContainText('Suspenso');
  const denied = await write(member, `/groups/${g.id}/posts`, 'post', {
    text: 'bloqueado',
    visibility: 'public',
  });
  expect(denied.status()).toBe(403);
  await target
    .getByRole('button', { name: 'Encerrar suspensão', exact: true })
    .click();
  await expect(
    target.getByRole('button', { name: 'Suspender membro', exact: true }),
  ).toBeVisible();
  await capture(page, 'groups-members-management-390');
  await target.getByLabel('Motivo da medida').fill('Remoção de teste');
  const removed = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      response.url().endsWith(`/groups/${g.id}/members/${me.user.id}`),
  );
  await target
    .getByRole('button', { name: 'Remover membro', exact: true })
    .click();
  expect((await removed).status()).toBe(200);
  await member.reload();
  await expect(member.locator('article.post')).toHaveCount(0);
  expect((await member.request.get(`/api/groups/${g.id}/posts`)).status()).toBe(
    403,
  );
  await other.close();
});
test('19E convite não listado usa token no fragmento, aceita e respeita revogação', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await prepare(page, false);
  const create = await write(page, '/groups', 'post', {
    creationKey: crypto.randomUUID(),
    name: 'Não listado Teste',
    description: 'Somente convite',
    privacyType: 'private',
    discoveryMode: 'unlisted',
    joinPolicy: 'approval',
    rules: ['Aceitar regras'],
  });
  expect(create.status()).toBe(201);
  const g = (await create.json()).group;
  await page.goto(`/comunidade/grupos/${g.id}`);
  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Gerar convite', exact: true })
    .click();
  const url = await page.getByLabel('Resultado do convite').inputValue();
  expect(url).toContain('#token=');
  await capture(page, 'groups-invitation-390');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' }),
    member = await other.newPage();
  await prepare(member, false);
  await member.goto(url);
  await expect(
    member.getByRole('heading', { name: 'Não listado Teste', exact: true }),
  ).toBeVisible();
  await member.getByLabel('Li e aceito as regras', { exact: true }).check();
  await member
    .getByRole('button', { name: 'Aceitar convite', exact: true })
    .click();
  await expect(
    member.getByRole('button', { name: 'Sair do grupo', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Gerar convite', exact: true })
    .click();
  const revoked = await page.getByLabel('Resultado do convite').inputValue();
  await page
    .getByRole('button', { name: 'Revogar convite', exact: true })
    .first()
    .click();
  await member.goto(revoked);
  await expect(member.getByRole('alert')).toContainText(
    'Convite expirado, revogado, recusado ou esgotado',
  );
  await other.close();
});
