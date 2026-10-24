import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { prepare } from './ride-fixtures';
const require = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { Pool } =
  require('pg') as typeof import('../../api/node_modules/@types/pg');
const { TOTP } =
  require('otpauth') as typeof import('../../api/node_modules/otpauth');
const password = 'senha longa para testar as sessoes';
test.describe.configure({ mode: 'serial' });
async function poolFor<T>(fn: (pool: InstanceType<typeof Pool>) => Promise<T>) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'verify-full'
        ? { rejectUnauthorized: true }
        : false,
  });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}
async function operator(page: Page) {
  await prepare(page, false);
  const me = await (await page.request.get('/api/auth/me')).json();
  await poolFor(async (pool) => {
    await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [
      me.user.id,
    ]);
    await pool.query(
      "INSERT INTO admin_user_roles(id,user_id,role_code,granted_by) VALUES($1,$2,'superadmin',$2)",
      [randomUUID(), me.user.id],
    );
  });
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Autenticação administrativa' }),
  ).toBeVisible();
  await page.getByLabel('Senha atual', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Configurar autenticador', exact: true })
    .click();
  const secret = await page.locator('.admin-evidence code').textContent();
  expect(secret).toBeTruthy();
  await page.getByLabel('Senha atual', { exact: true }).fill(password);
  await page
    .getByLabel('Código do autenticador', { exact: true })
    .fill(new TOTP({ secret: secret! }).generate());
  await page
    .getByRole('button', { name: 'Confirmar autenticação', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Guarde os códigos de recuperação' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Guardei os códigos · Abrir painel' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Visão geral', exact: true }),
  ).toBeVisible();
  return me;
}
test('22A usuário comum não recebe menu nem dados administrativos e mantém cinco abas', async ({
  page,
}) => {
  await prepare(page, false);
  await page.goto('/configuracoes');
  await expect(
    page.getByRole('link', { name: 'Painel administrativo', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.bottom-nav>a')).toHaveCount(5);
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(403);
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Acesso administrativo indisponível' }),
  ).toBeVisible();
});
test('22A MFA real, navegação autorizada, responsividade e revogação de papel', async ({
  page,
}) => {
  test.setTimeout(60000);
  const me = await operator(page);
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  for (const width of [320, 360, 390, 430, 850, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await mkdir('../../.local/screenshots', { recursive: true });
    await page.screenshot({
      path: `../../.local/screenshots/admin-dashboard-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('link', { name: 'Usuários', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Usuários', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await poolFor((pool) =>
    pool.query(
      'UPDATE admin_user_roles SET revoked_at=now() WHERE user_id=$1',
      [me.user.id],
    ),
  );
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Acesso administrativo indisponível' }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
test('22B caso, XSS escapado, decisão confirmada, feed atualizado e recurso do titular', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const context = await browser.newContext(),
    owner = await context.newPage();
  await prepare(owner, false);
  const me = await (await owner.request.get('/api/auth/me')).json(),
    headers = { 'X-Apex-Request': '1', 'X-CSRF-Token': me.csrfToken };
  const created = await owner.request.post('/api/social/posts', {
    headers,
    data: {
      text: '<img src=x onerror="window.__unsafe=true"> Caso de teste',
      visibility: 'public',
      mediaIds: [],
    },
  });
  expect(created.status()).toBe(201);
  const post = (await created.json()).post.id;
  const admin = await operator(page);
  const report = await page.request.post('/api/social/reports', {
    headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': admin.csrfToken },
    data: {
      kind: 'post',
      id: post,
      reason: 'personal_data',
      detail: 'Revisão delimitada de teste.',
    },
  });
  expect(report.status()).toBe(201);
  const cases = await (await page.request.get('/api/admin/reports')).json(),
    key = cases.items.find(
      (c: { target_id: string }) => c.target_id === post,
    ).id;
  expect(
    (
      await page.request.post(`/api/admin/reports/${key}/assign`, {
        headers: { 'X-Apex-Request': '1', 'X-CSRF-Token': admin.csrfToken },
        data: {
          assignedTo: admin.user.id,
          version: 1,
          reason: 'Atribuição operacional de teste.',
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/admin/reports');
  await page.getByRole('button', { name: 'Abrir ' + key, exact: true }).click();
  await expect(
    page.getByText('<img src=x onerror="window.__unsafe=true"> Caso de teste', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Reflect.get(window, '__unsafe')),
  ).toBeUndefined();
  await page
    .getByRole('button', { name: 'Registrar decisão', exact: true })
    .click();
  await page.getByLabel('Decisão', { exact: true }).selectOption('hide');
  await page.getByLabel('Código da política / motivo').fill('privacy-v1');
  await page
    .getByLabel('Fundamentação da decisão')
    .fill('Ocultação temporária por exposição de dados no teste.');
  await page
    .getByRole('button', { name: 'Revisar decisão', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Revise a decisão antes de executar' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Executar decisão', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Operação confirmada' }),
  ).toBeVisible();
  expect((await owner.request.get('/api/social/posts/' + post)).status()).toBe(
    404,
  );
  await owner.goto('/perfil/medidas');
  await expect(
    owner.getByText('Ocultação temporária por exposição de dados no teste.', {
      exact: true,
    }),
  ).toBeVisible();
  await owner
    .getByRole('button', { name: 'Contestar decisão', exact: true })
    .click();
  await owner
    .getByLabel('Fundamentação', { exact: true })
    .fill('Solicito revisão independente desta decisão de teste.');
  await owner
    .getByRole('button', { name: 'Enviar para revisão', exact: true })
    .click();
  await expect(owner.getByRole('status')).toContainText(
    'Solicitação registrada',
  );
  await context.close();
});
