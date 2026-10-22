// Playwright configuration for the Electron end-to-end test (e2e/app.spec.ts, UI-SPEC §5).
// Run after a full build: `npm run e2e` (builds, then runs Playwright). On Linux without a display:
// `xvfb-run -a npx playwright test`.
// Key decisions: one worker and no parallelism (the test starts the real app and its background service), generous
// timeouts (first start creates the database, project creation runs git), traces only for failures.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  outputDir: 'test-results',
});
