import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // The whole run stops after this, whatever is still going. Keep the suite to core functional checks
  // (rules are unit-tested) so it finishes well inside it.
  globalTimeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5181',
    headless: true,
    // Smaller than the game's 1280×720 (it scales to fit): less to draw, less memory.
    viewport: { width: 800, height: 450 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: { executablePath: '/usr/bin/google-chrome' },
      },
    },
  ],
  webServer: {
    command: 'npx vite --port 5181 --strictPort',
    url: 'http://localhost:5181',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
