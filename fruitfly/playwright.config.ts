import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  projects: [
    { name: 'landing', testMatch: /landing\.spec\.ts/, use: { baseURL: 'http://127.0.0.1:5191', launchOptions: { executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] } } },
    { name: 'extension', testMatch: /extension\.spec\.ts|safety\.spec\.ts/ },
  ],
  webServer: { command: 'pnpm --filter @fruitfly/landing build && pnpm --filter @fruitfly/landing preview --strictPort', url: 'http://127.0.0.1:5191', reuseExistingServer: true, timeout: 180_000 },
});
