import { defineConfig, devices } from '@playwright/test';

// E2E runs a dev server on its own port with the 'test' content profile and the dev-only endpoints switched on.
// It talks to the same database as the Vitest suite; every account it makes uses @fishora.test and is removed.
const PORT = 3200;

export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 860 },
    // Software WebGL so the aquarium renders headless.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { FISHORA_E2E: '1', FISHORA_CONFIG_PROFILE: 'test', NEXT_DIST_DIR: '.next-e2e' },
  },
});
