import { defineConfig, devices } from '@playwright/test';

// Browser tests drive the production build against the Postgres in
// compose.yaml. Each test signs in with a session row and cookie that the
// fixtures in e2e/fixtures.ts create. See docs/testing.md.

/** Matches BETTER_AUTH_URL in .env.test and the port `srvx serve` listens on. */
const BASE_URL = 'http://localhost:3000';

// The app is desktop-only.
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } }],
  webServer: {
    command: 'bun run build && bun run start',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { VARLOCK_ENV: 'test' },
    stdout: 'ignore',
    stderr: 'pipe',
    // Playwright's default SIGKILL stops only the shell; the server two
    // processes down would keep port 3000 for the next run.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    timeout: 120_000,
  },
});
