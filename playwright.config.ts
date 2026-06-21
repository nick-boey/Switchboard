import { defineConfig, devices } from '@playwright/test';

// E2E config. The temp-git fixture smoke test proves the harness; the web `app-shell` suite
// (task 6.1) drives the real Mantine shell through the bearer path against a `start(ctx)`
// server. The two are isolated into separate projects so the browser-driven web suite does
// not disturb the headless temp-git smoke.
const PREVIEW_PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  projects: [
    {
      // The original harness smoke — unchanged behaviour; it never touches a browser page or
      // the web preview server.
      name: 'chromium',
      testIgnore: /app-shell\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The web shell suite (task 6.1): a real browser against the built app served by the
      // `webServer` below, talking to a `start(ctx)` server booted inside the spec.
      name: 'web',
      testMatch: /app-shell\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
  ],
  // Build + serve the web app for the `web` project. `vite preview` serves the production
  // build, matching how the shell ships. `reuseExistingServer` keeps local iteration fast.
  webServer: {
    command: `pnpm --filter @switchboard/web build && pnpm --filter @switchboard/web preview --port ${PREVIEW_PORT} --strictPort`,
    url: `http://localhost:${PREVIEW_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
