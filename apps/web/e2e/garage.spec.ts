import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

async function login(page: Page) {
  const id = randomUUID().replaceAll('-', '').slice(0, 12);
  const email = `${id}@example.com`;
  const headers = { 'X-Apex-Request': '1' };
  const registration = await page.request.post('/api/auth/register', {
    headers,
    data: {
      displayName: 'Piloto Garagem',
      username: `garage_${id}`,
      email,
      password: 'senha longa para testes garagem',
      acceptTerms: true,
      termsVersion: 'prelaunch-draft',
      privacyVersion: 'prelaunch-draft',
    },
  });
  expect(registration.status()).toBe(201);
  const session = await page.request.post('/api/auth/login', {
    headers,
    data: { email, password: 'senha longa para testes garagem' },
  });
  expect(session.status()).toBe(200);
  return (await session.json()) as {
    csrfToken: string;
    user: { username: string };
  };
}
async function fill(page: Page, model = 'CB 650R') {
  await page.getByLabel('Marca', { exact: true }).fill('Honda');
  await page.getByLabel('Modelo', { exact: true }).fill(model);
  await page.getByLabel('Ano', { exact: true }).fill('2025');
  await page.getByLabel('Cilindrada (cc)', { exact: true }).fill('649');
}
async function noOverflow(page: Page, width: number) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
  await expect(
    page.getByRole('navigation', { name: 'Navegação principal' }),
  ).toBeVisible();
  expect(
    await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link')
      .count(),
  ).toBe(5);
}

test('garagem real: foto, edição, principal, perfil, privacidade e exclusão', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const session = await login(page);
  await page.goto('/garagem');
  await expect(
    page.getByRole('heading', { name: 'Sua garagem está vazia.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Cadastrar primeira moto' }).click();
  await page.getByRole('button', { name: 'Salvar moto' }).click();
  expect(
    await page
      .getByLabel('Marca', { exact: true })
      .evaluate((el) => (el as HTMLInputElement).validity.valueMissing),
  ).toBe(true);
  await fill(page);
  await page
    .getByLabel('Fotografia (opcional)')
    .setInputFiles('public/assets/garage-bike.webp');
  await expect(
    page.getByAltText('Prévia da fotografia selecionada'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Salvar moto' }).click();
  await expect(page).toHaveURL(/\/garagem\/[a-f0-9-]+$/);
  await expect(page.getByRole('status')).toContainText('Moto cadastrada.');
  await expect(page.getByText('Moto principal', { exact: true })).toBeVisible();
  const firstPath = new URL(page.url()).pathname;
  const photo = page.getByAltText('Honda CB 650R', { exact: true });
  await expect(photo).toBeVisible();
  expect(
    await photo.evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Editar moto', exact: true }).click();
  await expect(page.getByLabel('Modelo', { exact: true })).toHaveValue(
    'CB 650R',
  );
  await page.getByLabel('Modelo', { exact: true }).fill('CB 650R Sport');
  await page
    .getByLabel('Fotografia (opcional)')
    .setInputFiles('public/assets/sunset-bike.webp');
  await page.getByRole('button', { name: 'Salvar moto' }).click();
  await expect(page.getByRole('status')).toContainText('Moto atualizada.');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'CB 650R Sport', exact: true }),
  ).toBeVisible();
  const firstPhotoUrl = await page
    .getByAltText('Honda CB 650R Sport', { exact: true })
    .getAttribute('src');
  expect((await request.get(firstPhotoUrl!)).status()).toBe(200);
  const privacy = await page.request.patch('/api/users/me/privacy', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': session.csrfToken },
    data: { profileVisibility: 'private' },
  });
  expect(privacy.status()).toBe(200);
  expect((await request.get(firstPhotoUrl!)).status()).toBe(404);
  expect(
    (
      await request.get(`/api/users/${session.user.username}/motorcycles`)
    ).status(),
  ).toBe(404);
  expect((await page.request.get(firstPhotoUrl!)).status()).toBe(200);
  await page.getByRole('link', { name: 'Voltar para a garagem' }).click();
  await page.getByRole('link', { name: 'Adicionar Moto', exact: true }).click();
  await fill(page, 'CRF 300L');
  await page.getByRole('button', { name: 'Salvar moto' }).click();
  await expect(page.getByRole('heading', { name: 'CRF 300L' })).toBeVisible();
  await page.getByRole('button', { name: 'Definir como principal' }).click();
  await expect(page.getByText('Moto principal', { exact: true })).toBeVisible();
  const secondPath = new URL(page.url()).pathname;
  await page.goto('/perfil');
  await expect(
    page.locator('.profile-motorcycles .motorcycle-card'),
  ).toHaveCount(2);
  await expect(
    page.locator('.profile-motorcycles .motorcycle-card').first(),
  ).toContainText('CRF 300L');
  await expect(page.locator('.profile-motorcycles')).toContainText(
    'CB 650R Sport',
  );
  await page.goto(firstPath + '/editar');
  await page.getByLabel('Remover fotografia atual ao salvar').check();
  await page.getByRole('button', { name: 'Salvar moto' }).click();
  await expect(
    page.getByRole('img', { name: 'Moto sem fotografia' }),
  ).toBeVisible();
  await page.goto(secondPath);
  await page.getByRole('button', { name: 'Excluir moto', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Confirmar exclusão' }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Excluir moto', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirmar exclusão', exact: true })
    .click();
  await expect(page).toHaveURL(/\/garagem$/);
  await expect(page.locator('.motorcycle-card')).toHaveCount(1);
  await expect(page.locator('.motorcycle-card')).toContainText(
    'Moto principal',
  );
  await page.goto(firstPath);
  await page.getByRole('button', { name: 'Excluir moto', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirmar exclusão', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Sua garagem está vazia.' }),
  ).toBeVisible();
  await page.goto('/perfil');
  await expect(page.locator('.profile-top-grid')).toContainText(
    'Sua garagem está vazia.',
  );
});

test('garagem, cadastro, detalhes, edição e perfil sem overflow nas cinco larguras mobile', async ({
  page,
}) => {
  await login(page);
  await mkdir('../../.local/screenshots', { recursive: true });
  await page.goto('/garagem');
  for (const width of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 860 });
    await noOverflow(page, width);
    await page.screenshot({
      path: `../../.local/screenshots/parte04-vazia-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto('/garagem/nova');
  await fill(
    page,
    'Modelo com nome longo para verificar os cartões da garagem e os detalhes',
  );
  await page
    .getByLabel('Marca', { exact: true })
    .fill('Fabricante independente com nome extenso para a garagem');
  for (const width of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 860 });
    await noOverflow(page, width);
    await page.screenshot({
      path: `../../.local/screenshots/parte04-formulario-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Salvar moto' }).click();
  await expect(page).toHaveURL(/\/garagem\/[a-f0-9-]+$/);
  const path = new URL(page.url()).pathname;
  for (const width of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 860 });
    for (const route of [path, `${path}/editar`, '/garagem', '/perfil']) {
      await page.goto(route);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByText('Carregando moto…')).toBeHidden();
      await noOverflow(page, width);
      if (route === '/garagem' || route === path)
        await page.screenshot({
          path: `../../.local/screenshots/parte04-${route === path ? 'detalhes' : 'lista'}-${width}.png`,
          fullPage: true,
        });
    }
  }
});

test('falha de upload permite tentar de novo sem duplicar moto; erros de rede e HEIC são claros', async ({
  page,
}) => {
  await login(page);
  await page.goto('/garagem/nova');
  await fill(page);
  await page.getByLabel('Fotografia (opcional)').setInputFiles({
    name: 'foto.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('heic'),
  });
  await expect(page.getByRole('alert')).toContainText('HEIC');
  await page
    .getByLabel('Fotografia (opcional)')
    .setInputFiles('public/assets/garage-bike.webp');
  await page.route('**/api/motorcycles/*/photo', (route) => route.abort());
  await page.getByRole('button', { name: 'Salvar moto' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível conectar',
  );
  expect(
    (await (await page.request.get('/api/motorcycles')).json()).motorcycles,
  ).toHaveLength(1);
  await page.unroute('**/api/motorcycles/*/photo');
  await page.getByRole('button', { name: 'Salvar moto' }).click();
  await expect(page).toHaveURL(/\/garagem\/[a-f0-9-]+$/);
  expect(
    (await (await page.request.get('/api/motorcycles')).json()).motorcycles,
  ).toHaveLength(1);
  await page.route('**/api/motorcycles', (route) => route.abort());
  await page.goto('/garagem');
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível conectar',
  );
  await page.unroute('**/api/motorcycles');
  await page
    .getByRole('button', { name: 'Tentar novamente', exact: true })
    .click();
  await expect(page.locator('.motorcycle-card')).toHaveCount(1);
});
