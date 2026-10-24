import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  outputDir: '../../.local/playwright-results',
  reporter: [['list']],
  webServer: [
    {
      command:
        'pnpm --filter @apex-ride/api exec node --import tsx src/server.ts',
      url: 'http://127.0.0.1:3002/api/health',
      env: {
        PORT: '3002',
        LOG_LEVEL: 'silent',
        AUTH_WEB_ORIGIN: 'http://127.0.0.1:5174',
        CORS_ORIGINS: 'http://127.0.0.1:5174',
        AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
        MAIL_MODE: 'test',
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command:
        process.env.E2E_WEB_MODE === 'development'
          ? 'pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort'
          : 'pnpm exec vite preview --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
