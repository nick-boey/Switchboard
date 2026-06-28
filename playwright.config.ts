import { defineConfig, devices } from '@playwright/test';

// E2E config. The temp-git fixture smoke test proves the harness; the web `app-shell` suite
// (task 6.1) drives the real Mantine shell through the bearer path against a `start(ctx)`
// server. The prototype-workbench smokes (tasks 7.1–7.4) build the two Storybooks and render the
// prototype workbench on port 6007. Each browser-driven suite is isolated into its own project so
// it does not disturb the headless temp-git smoke.
const PREVIEW_PORT = 4173;
const PROTOTYPE_STORYBOOK_PORT = 6007;
// Specs owned by dedicated projects below — kept out of the headless `chromium` smoke project.
const DEDICATED_SPECS = [
  /app-shell\.spec\.ts/,
  /repos-home\.spec\.ts/,
  /page-routing\.spec\.ts/,
  /storybook-prototypes\..*\.spec\.ts/,
  /repo-clone\.spec\.ts/,
  /worktree\.spec\.ts/,
  /session\.spec\.ts/,
];

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
      testIgnore: DEDICATED_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The web shell suite (task 6.1): a real browser against the built app served by the
      // `webServer` below, talking to a `start(ctx)` server booted inside the spec.
      name: 'web',
      testMatch: /app-shell\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
    {
      // The repo-clone-browse flow (group 9): the New repository → clone → getting-ready flow
      // against a real `start(ctx)` server, with a fake GitHub and github.com clones redirected
      // to local source repos (no network).
      name: 'repo-clone',
      testMatch: /repo-clone\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
    {
      // The worktree-management flow: create / list / delete worktrees in the hub against a real
      // `start(ctx)` server, with github.com clones redirected to local source repos (no network).
      name: 'worktree',
      testMatch: /worktree\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
    {
      // The repositories-home flow (repos-home-and-sidebar): the aggregated home + per-org sidebar
      // against a real `start(ctx)` server, with github.com clones redirected to local source repos
      // (no network).
      name: 'repos-home',
      testMatch: /repos-home\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
    {
      // The page-routing flow (web-navigation): clean-path routing end-to-end — address-bar
      // updates, browser Back/Forward (incl. between repo anchors), and deep-link load + scroll +
      // reload — against a real `start(ctx)` server, github.com clones redirected to local source
      // repos (no network), served by the same `vite preview` webServer.
      name: 'page-routing',
      testMatch: /page-routing\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
    {
      // The claude-session-launch flow: the session plug on/off round-trip + the liveness seam
      // (a live session blocks a non-force delete), against a real `start(ctx)` server with a
      // FAKED tmux boundary (no real `claude` login in CI) and local clones (no network).
      name: 'session',
      testMatch: /session\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
    {
      // Prototype-workbench build smoke (tasks 7.1–7.2): runs the Storybook builds itself and
      // inspects `index.json`; needs no browser page or server.
      name: 'storybook-build',
      testMatch: /storybook-prototypes\.build\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Prototype-workbench render smoke (tasks 7.3–7.4): a real browser against the prototype
      // Storybook dev server (port 6007) started by the `webServer` below.
      name: 'storybook-prototypes',
      testMatch: /storybook-prototypes\.render\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${PROTOTYPE_STORYBOOK_PORT}`,
      },
    },
  ],
  // `vite preview` serves the production web build for the `web` project; `storybook:prototypes`
  // serves the dedicated prototype workbench on 6007 for the render smoke. Both match how they
  // ship/run. `reuseExistingServer` keeps local iteration fast.
  webServer: [
    {
      command: `pnpm --filter @switchboard/web build && pnpm --filter @switchboard/web preview --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @switchboard/web storybook:prototypes`,
      url: `http://localhost:${PROTOTYPE_STORYBOOK_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
