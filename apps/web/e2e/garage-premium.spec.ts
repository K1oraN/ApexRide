import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];
const directory = '../../.local/screenshots/refinamento6';
async function capture(page: Page, name: string) {
  await expect(page.locator('h1')).toHaveCount(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await page.screenshot({
    path: `${directory}/${name}-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
}
test('Etapa 6 · catálogo real, garagem premium, registros persistentes e oito larguras', async ({
  page,
}) => {
  test.setTimeout(180000);
  await mkdir(directory, { recursive: true });
  const name = 'garage6_' + randomUUID().replaceAll('-', '').slice(0, 10),
    password = 'Senha longa para garagem premium';
  const headers = { 'X-Apex-Request': '1' };
  expect(
    (
      await page.request.post('/api/auth/register', {
        headers,
        data: {
          displayName: 'Piloto fixture de teste',
          username: name,
          email: `${name}@example.com`,
          password,
          acceptTerms: true,
          termsVersion: 'prelaunch-draft',
          privacyVersion: 'prelaunch-draft',
        },
      })
    ).status(),
  ).toBe(201);
  const login = await page.request.post('/api/auth/login', {
    headers,
    data: { email: `${name}@example.com`, password },
  });
  expect(login.status()).toBe(200);
  const csrf = (await login.json()).csrfToken;
  await page.goto('/garagem');
  await expect(
    page.getByRole('heading', { name: 'Sua garagem começa aqui.' }),
  ).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'vazia');
  }
  await page.goto('/garagem/nova');
  await page.getByRole('combobox', { name: 'Marca do catálogo',exact:true }).fill('HON');
  await page.getByRole('option', { name: 'Honda', exact: true }).click();
  await page.getByRole('combobox', { name: 'Modelo do catálogo',exact:true }).fill('CB');
  await page.getByRole('option', { name: 'CB 650R', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Ano-modelo do catálogo',exact:true })
    .fill('2026');
  await page.getByRole('option', { name: '2026', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Buscar modelo no catálogo' })
    .fill('CB650R');
  const chosen = page.getByRole('button', {
    name: /Honda CB 650R 2026 · E-Clutch/,
  });
  await expect(chosen).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'catalogo');
  }
  await chosen.click();
  await expect(page.getByLabel('Marca', { exact: true })).toHaveValue('Honda');
  await expect(page.getByLabel('Ano', { exact: true })).toHaveValue('2026');
  await expect(page.getByLabel('Cilindrada (cc)', { exact: true })).toHaveValue(
    '649',
  );
  await page
    .getByLabel('Fotografia (opcional)')
    .setInputFiles('public/assets/garage-bike.webp');
  await page.getByRole('button', { name: 'Salvar moto', exact: true }).click();
  await expect(page).toHaveURL(/\/garagem\/[a-f0-9-]+$/);
  const detail = new URL(page.url()).pathname;
  await expect(
    page.getByRole('heading', { name: 'CB 650R', exact: true }),
  ).toBeVisible();
  for (const data of [
    {
      brand: 'Bajaj',
      model: 'Dominar 400',
      year: 2025,
      displacementCc: 373.27,
      propulsion: 'combustion',
    },
    {
      brand: 'Manual',
      model: 'Elétrica de teste',
      year: 2026,
      displacementCc: null,
      propulsion: 'electric',
    },
  ])
    expect(
      (
        await page.request.post('/api/motorcycles', {
          headers: { ...headers, 'X-CSRF-Token': csrf },
          data,
        })
      ).status(),
    ).toBe(201);
  await page.goto('/garagem');
  await expect(page.locator('.garage-bike-tile')).toHaveCount(3);
  await expect(page.locator('.garage-spec-sheet')).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'principal');
  }
  await page
    .getByRole('searchbox', { name: 'Buscar na minha garagem' })
    .fill('elétrica');
  await expect(page.locator('.garage-bike-tile')).toHaveCount(1);
  await expect(page.locator('.garage-hero-copy')).toContainText('Elétrica');
  await page.goto(detail);
  await page.getByRole('button', { name: 'Manutenção', exact: true }).click();
  await page
    .getByRole('button', { name: 'Adicionar registro', exact: true })
    .click();
  await page
    .getByLabel('Título do registro')
    .fill('Revisão · registro de teste');
  await page.getByLabel('Data', { exact: true }).fill('2026-01-02');
  await page.getByLabel('Odômetro informado', { exact: true }).fill('1200');
  await page.getByLabel('Custo (R$)', { exact: true }).fill('150.50');
  await page
    .getByLabel('Anotações do registro')
    .fill('Óleo e filtro. Dados sintéticos de teste.');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'manutencao-formulario');
  }
  await page
    .getByRole('button', { name: 'Salvar registro', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Revisão · registro de teste' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Manutenção', exact: true }).click();
  await expect(page.getByText('R$ 150,50', { exact: true })).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'manutencao');
  }
  await page
    .getByRole('button', { name: 'Registros pessoais', exact: true })
    .click();
  await page.getByLabel('Tipo de registro').selectOption('insurance');
  await page
    .getByRole('button', { name: 'Adicionar registro', exact: true })
    .click();
  await page
    .getByLabel('Título do registro')
    .fill('Seguro · declaração de teste');
  await page.getByLabel('Seguradora informada').fill('Dados sintéticos');
  await page.getByLabel('Data', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Fim da vigência / vencimento').fill('2027-01-01');
  await page
    .getByRole('button', { name: 'Salvar registro', exact: true })
    .click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'registros-privados');
  }
  await page
    .getByRole('button', { name: 'Ficha técnica', exact: true })
    .click();
  await expect(page.getByText('86,7 cv', { exact: true })).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'ficha');
  }
  await page.getByRole('button', { name: 'Atividades', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Abrir atividades e Replay' }),
  ).toHaveAttribute('href', /motorcycleId=/);
  await page.goto('/garagem/nova');
  await page
    .getByRole('button', { name: /Minha moto não está na lista/ })
    .click();
  await page.getByRole('radio', { name: 'Elétrica', exact: true }).check();
  await expect(page.getByLabel('Cilindrada (cc)', { exact: true })).toHaveCount(
    0,
  );
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'cadastro-eletrica');
  }
  await page.goto('/garagem');
  await page.route('**/api/motorcycles', (route) => route.abort());
  await page.reload();
  await expect(
    page.getByText(
      'Cópia deste aparelho · sem fotografias ou registros privados.',
      { exact: false },
    ),
  ).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'copia-local');
  }
  await page.unroute('**/api/motorcycles');
  expect(
    (
      await page.request.delete(
        `/api/motorcycles/${detail.split('/').at(-1)}`,
        { headers: { ...headers, 'X-CSRF-Token': csrf } },
      )
    ).status(),
  ).toBe(200);
  await page.goto(detail + '?archived=true');
  await expect(page.getByText('Arquivada', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Editar moto', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Manutenção', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Revisão · registro de teste' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Adicionar registro', exact: true }),
  ).toHaveCount(0);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, 'arquivada');
  }
});
