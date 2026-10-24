import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { authenticate } from './auth-fixtures';
import { mockMapProvider } from './gps-fixtures';
import { begin, finish, prepare } from './ride-fixtures';

test('header truthful, popovers keyboard accessible and exactly five navigation tabs', async ({
  page,
}) => {
  await authenticate(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/app');
  const profile = (await (await page.request.get('/api/auth/me')).json()).user;
  const region = [profile.city, profile.state].filter(Boolean).join(', ');
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav.getByRole('link')).toHaveCount(5);
  const ride = nav.getByRole('link', { name: 'Ride', exact: true });
  await expect(ride).toHaveAttribute('data-ride-state', 'inactive');
  await page.getByRole('button', { name: 'Localização', exact: true }).click();
  await expect(page.locator('.location-menu .popover-content p')).toHaveText(
    region || 'Você ainda não definiu sua região.',
  );
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Localização', exact: true }),
  ).toBeFocused();
  const notifications = page.getByRole('button', {
    name: 'Notificações',
    exact: true,
  });
  await notifications.click();
  await expect(
    page.getByText(/As notificações ainda não estão disponíveis/),
  ).toBeVisible();
  await expect(page.locator('.notification-dot')).toHaveCount(0);
  const box = await page
    .locator('.notifications .popover-content')
    .boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(notifications).toBeFocused();
  await ride.click();
  await expect(ride).toHaveAttribute('aria-current', 'page');
  await expect(ride).toHaveAttribute('data-ride-state', 'preparing');
});

test('searchable region popup stays visible on small screens, retains choice and supports keyboard', async ({
  page,
}) => {
  await authenticate(page);
  await mockMapProvider(page);
  // Explicit UI fixture only: never a production region or public aggregate.
  await page.route('**/api/similarity/regions', (route) =>
    route.fulfill({
      json: {
        regions: [
          { id: 'test-maceio', city: 'Maceió', state: 'AL' },
          {
            id: 'test-sao',
            city: 'São Miguel dos Campos com nome administrativo extenso',
            state: 'AL',
          },
        ],
      },
    }),
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/descobertas');
    await page
      .getByText('Descobertas de trajetos semelhantes', { exact: true })
      .click();
    const combo = page.getByRole('combobox', { name: 'Região administrativa' });
    await expect(combo).toBeEnabled();
    await combo.scrollIntoViewIfNeeded();
    await combo.click();
    await combo.fill('sao miguel');
    const list = page.getByRole('listbox', { name: 'Região administrativa' });
    await expect(list.getByRole('option')).toHaveCount(1);
    const bounds = await list.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
    await mkdir('../../.local/screenshots/refinamento2', { recursive: true });
    await page.screenshot({
      path: `../../.local/screenshots/refinamento2/filtros-abertos-${width}.png`,
    });
    await combo.press('Enter');
    await expect(combo).toHaveValue(/São Miguel/);
    await combo.press('ArrowDown');
    await combo.fill('maceio');
    await combo.press('Escape');
    await expect(combo).toHaveValue(/São Miguel/);
    await expect(list).toHaveCount(0);
    await combo.press('ArrowDown');
    await combo.fill('maceio');
    await combo.press('Enter');
    await expect(combo).toHaveValue('Maceió / AL');
    const category = page.getByRole('combobox', {
      name: 'Categoria',
      exact: true,
    });
    expect((await category.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test('destructive confirmation traps focus, dismisses on Escape and returns to its trigger', async ({
  page,
}) => {
  await prepare(page);
  const bikes = (await (await page.request.get('/api/motorcycles')).json())
    .motorcycles;
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/garagem/${bikes[0].id}`);
  const trigger = page.getByRole('button', {
    name: 'Excluir moto',
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Confirmar exclusão', exact: true }),
  ).toHaveClass(/button-destructive/);
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    // Chromium includes an intermediate browser focus stop when wrapping.
    expect(
      await page.evaluate(
        () =>
          document.activeElement === document.body ||
          !!document.activeElement?.closest('dialog'),
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: '../../.local/screenshots/refinamento2/exclusao-320.png',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    (await (await page.request.get('/api/motorcycles')).json()).motorcycles
      .length,
  ).toBe(bikes.length);
});

test('Ride navigation states come from controller and survive navigating away', async ({
  page,
}) => {
  await prepare(page);
  const ride = page.locator('.ride-nav');
  await expect(ride).toHaveAttribute('data-ride-state', 'preparing');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('.ride-dashboard').screenshot({
    path: '../../.local/screenshots/refinamento2/ride-instrumentos-390.png',
  });
  await begin(page);
  await expect(ride).toHaveAttribute('data-ride-state', 'active');
  await page.locator('.ride-dashboard').screenshot({
    path: '../../.local/screenshots/refinamento2/ride-ativo-instrumentos-390.png',
  });
  await page.locator('.lean-grid').screenshot({
    path: '../../.local/screenshots/refinamento2/inclinacao-390.png',
  });
  await page.locator('.force-grid').screenshot({
    path: '../../.local/screenshots/refinamento2/forca-g-390.png',
  });
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(ride).toHaveAttribute('data-ride-state', 'paused');
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Início', exact: true })
    .click();
  await expect(ride).toHaveAttribute('data-ride-state', 'paused');
  await ride.click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.evaluate(() => window.__gpsTest.emit());
  await expect(ride).toHaveAttribute('data-ride-state', 'active');
  await finish(page);
  await expect(ride).toHaveAttribute('data-ride-state', 'finishing');
});

test('primary computed colors keep contrast on hover and focus remains visible with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/entrar');
  // Regression for shared selectors accidentally painting a second input box.
  await expect(page.getByLabel('E-mail ou usuário', { exact: true })).toHaveCSS(
    'border-top-width',
    '0px',
  );
  await expect(page.locator('.auth-field-icon').first()).toHaveCSS(
    'color',
    'rgb(243, 19, 39)',
  );
  const button = page.getByRole('button', { name: 'Entrar', exact: true });
  for (const hover of [false, true]) {
    if (hover) await button.hover();
    const ratio = await button.evaluate((element) => {
      const style = getComputedStyle(element);
      const luminance = (color: string) => {
        const rgb = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((value) => value / 255)
          .map((value) =>
            value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
          );
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      };
      const foreground = luminance(style.color),
        background = luminance(style.backgroundColor);
      return (
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05)
      );
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
  await page.getByLabel('Senha', { exact: true }).focus();
  await page.keyboard.press('Tab');
  const toggle = page.getByRole('button', {
    name: 'Mostrar senha',
    exact: true,
  });
  await expect(toggle).toBeFocused();
  expect(
    await toggle.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
});

test('registered motorcycle and real uploaded photograph at eight viewport widths', async ({
  page,
}) => {
  const bikes = await prepare(page);
  const session = await (await page.request.get('/api/auth/me')).json();
  const upload = await page.request.post(`/api/motorcycles/${bikes[0]}/photo`, {
    headers: {
      'X-Apex-Request': '1',
      'X-CSRF-Token': session.csrfToken,
      'Content-Type': 'image/webp',
    },
    data: await readFile('public/assets/garage-bike.webp'),
  });
  expect(upload.status()).toBe(200);
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/garagem');
    await expect(
      page.getByRole('link', { name: 'Ver Honda CB 650R', exact: true }),
    ).toBeVisible();
    await page
      .getByAltText('Honda CB 650R', { exact: true })
      .evaluate((image: HTMLImageElement) => image.decode());
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/refinamento2/garagem-cadastrada-${width}.png`,
      fullPage: true,
    });
    await page.goto(`/garagem/${bikes[0]}`);
    await expect(
      page.getByRole('heading', { name: 'CB 650R', exact: true }),
    ).toBeVisible();
    await page
      .getByAltText('Honda CB 650R', { exact: true })
      .evaluate((image: HTMLImageElement) => image.decode());
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../.local/screenshots/refinamento2/moto-detalhes-${width}.png`,
      fullPage: true,
    });
  }
});
