import { defineConfig, devices } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:4000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @xpntl/api dev',
      url: `${apiUrl}/v1/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @xpntl/web dev -- --host 127.0.0.1 --port 4173',
      url: webUrl,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
