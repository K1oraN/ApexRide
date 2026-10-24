import { expect, type Page, type Cookie } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// One real synthetic account/session per worker avoids exhausting registration
// limits in viewport/hardware regression tests. Every context still has a real cookie.
let cookies: Cookie[] | undefined;
export async function authenticate(page: Page) {
  if (!cookies) {
    const id = randomUUID().replaceAll('-', '').slice(0, 12);
    const email = `entry_${id}@example.com`;
    const password = 'frase de senha para regressao autenticada';
    const headers = { 'X-Apex-Request': '1' };
    expect(
      (
        await page.request.post('/api/auth/register', {
          headers,
          data: {
            displayName: 'Piloto de teste',
            username: `entry_${id}`,
            email,
            password,
            acceptTerms: true,
            termsVersion: 'prelaunch-draft',
            privacyVersion: 'prelaunch-draft',
          },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await page.request.post('/api/auth/login', {
          headers,
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    cookies = await page.context().cookies();
  } else await page.context().addCookies(cookies);
}
