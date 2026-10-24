import { chooseOption } from './choices';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const password = 'minha frase de senha bem segura';

test('cadastro, login, recarga, perfil, privacidade e logout com API e PostgreSQL reais', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.addInitScript(() => {
    const blocked = () => {
      throw new Error('Hardware não autorizado');
    };
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition = blocked;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = blocked;
  });
  const id = randomUUID().replaceAll('-', '').slice(0, 12);
  const email = `${id}@example.com`,
    username = `piloto_${id}`;
  await page.goto('/perfil');
  await expect(page).toHaveURL(/\/entrar\?retorno=/);
  await page.getByRole('link', { name: 'Criar conta', exact: true }).click();
  await page
    .getByLabel('Nome completo', { exact: true })
    .fill('Ana Motociclista');
  await page.getByLabel('Nome de usuário', { exact: true }).fill(username);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Mostrar senha', exact: true })
    .click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await page
    .getByLabel('Confirmar senha', { exact: true })
    .fill('outra senha diferente');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'As senhas precisam ser iguais.',
  );
  await page.getByLabel('Confirmar senha', { exact: true }).fill(password);
  const registration = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/auth/register') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  expect((await registration).status()).toBe(201);
  await expect(page.getByRole('status')).toContainText('Conta criada');
  await page.getByRole('link', { name: 'Voltar para entrar' }).click();
  await page.getByLabel('E-mail ou usuário', { exact: true }).fill(username);
  await page.getByLabel('Senha', { exact: true }).fill('senha errada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('inválidos');
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(
    page.getByRole('heading', { name: 'Ana Motociclista', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.profile-copy')).toContainText(`@${username}`);
  await expect(page.locator('.profile-stats')).not.toContainText('1.240');
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'apex_session')?.httpOnly).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'apex_session',
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Ana Motociclista', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Editar perfil', exact: true }).click();
  await page
    .getByLabel('Nome de exibição', { exact: true })
    .fill('Ana das Curvas');
  await page
    .getByLabel('Biografia', { exact: true })
    .fill('Passeios pelo litoral.');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.getByRole('status')).toHaveText('Perfil atualizado.');
  await page
    .getByRole('link', { name: 'Configurações de privacidade' })
    .click();
  await expect(
    page
      .getByRole('radiogroup', {
        name: 'Visibilidade padrão de atividades futuras',
        exact: true,
      })
      .getByRole('radio', { name: 'Público', exact: true }),
  ).toBeChecked();
  await chooseOption(page, 'Visibilidade do perfil', 'private');
  await chooseOption(
    page,
    'Visibilidade padrão de atividades futuras',
    'private',
  );
  await page.getByRole('button', { name: 'Salvar privacidade' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Preferências de privacidade salvas.',
  );
  expect((await page.request.get(`/api/users/${username}`)).status()).toBe(404);
  await page.reload();
  await expect(
    page
      .getByRole('radiogroup', { name: 'Visibilidade do perfil', exact: true })
      .getByRole('radio', { name: 'Privado', exact: true }),
  ).toBeChecked();
  await expect(page.getByText('Localização ao vivo: desativada')).toBeVisible();
  await page.getByRole('link', { name: 'Meu perfil', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Ana das Curvas', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.profile-bio')).toHaveText(
    'Passeios pelo litoral.',
  );
  await mkdir('../../.local/screenshots', { recursive: true });
  await page.screenshot({
    path: '../../.local/screenshots/parte03-perfil-320.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Editar perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(/\/entrar\?retorno=/);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.goto('/perfil');
  await expect(page).toHaveURL(/\/entrar\?retorno=/);
});

for (const width of [320, 390, 768])
  test(`formulários públicos sem overflow em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/entrar',
      '/cadastro',
      '/recuperar-senha',
      '/redefinir-senha#token=invalido',
      '/verificar-email#token=invalido',
    ]) {
      await page.goto(route);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (route === '/cadastro') {
        await page.getByRole('checkbox').waitFor();
        await page.screenshot({
          path: `../../.local/screenshots/parte03-cadastro-${width}.png`,
          fullPage: true,
        });
      }
    }
  });

test('recuperação informa envio desabilitado em teste; API mantém resposta genérica e falha de rede oferece nova tentativa', async ({
  page,
}) => {
  await page.goto('/recuperar-senha');
  await expect(page.getByRole('status')).toContainText(
    'O envio de e-mails não está habilitado',
  );
  await expect(
    page.getByRole('button', { name: 'Enviar instruções' }),
  ).toBeDisabled();
  const response = await page.request.post('/api/auth/password/forgot', {
    headers: { 'X-Apex-Request': '1' },
    data: { email: 'desconhecido@example.com' },
  });
  expect(response.status()).toBe(202);
  expect((await response.json()).message).toContain(
    'Se houver uma conta elegível',
  );
  await page.route('**/api/auth/me', (route) => route.abort());
  await page.goto('/perfil');
  await expect(
    page.getByRole('heading', { name: 'Conexão indisponível' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Tentar novamente', exact: true }).last(),
  ).toBeVisible();
});
