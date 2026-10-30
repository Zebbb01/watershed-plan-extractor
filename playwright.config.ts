import { defineConfig, devices } from '@playwright/test';

// End-to-end tests of the site's user flows (e2e/), against a production build started when none runs on 3100;
// model calls are mocked in the tests, so no API key or credit is used.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  // A production build: what ships, and no dev-server reloads in the middle of a test.
  webServer: { command: 'npm run build && npm start -w frontend', url: 'http://localhost:3100/api/health', reuseExistingServer: true, timeout: 420_000 },
});
