import { test, expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import type { ServerHandle } from '@switchboard/shared';
// The web app is a separate consumer of the server (no project-reference cycle), so the e2e
// boots the ALREADY-BUILT server entrypoint via its published dist rather than a workspace
// import. `start(ctx)` (Decision 2) binds loopback-only; the browser reaches it cross-origin
// through the strict CORS allowlist below.
import { start } from '../apps/server/dist/index.js';

/**
 * Web shell E2E (task 6.1). Loads the real app shell **through the bearer path** against a
 * REAL `start(ctx)` server:
 *
 * 1. boot a genuine server with a KNOWN bearer token + a CORS allowlist admitting the
 *    preview origin (the test controls both),
 * 2. serve the built web app via `vite preview` (the Playwright `webServer`),
 * 3. inject the server URL + bearer token into the page before it loads (no secret is
 *    committed — the token is generated here and handed to the app at runtime),
 * 4. assert the mobile-first shell renders AND that the protected cloned-repositories route round
 *    trips (the empty list → the home's clone CTA) — proving the typed `hc` client authenticated
 *    with the bearer token.
 *
 * The injected token is a throwaway test value, not a real secret.
 */

const PREVIEW_ORIGIN = 'http://localhost:4173';
// Throwaway, test-only bearer token. The server is configured to accept exactly this value
// and the page is handed the same value at runtime via `addInitScript`.
const TEST_BEARER_TOKEN = 'e2e-bearer-token-0123456789abcdef';

let server: ServerHandle | undefined;

test.beforeAll(async () => {
  const ctx = makeTestContext({
    // Isolate the workspace so the cloned-repositories list is deterministically empty.
    workspaceRoot: mkdtempSync(join(tmpdir(), 'shell-ui-')),
    config: configSchema.parse({
      bearerToken: TEST_BEARER_TOKEN,
      // Admit the preview origin so the browser's cross-origin fetch is not blocked by the
      // server's strict CORS policy (Decision 3).
      cors: { allowedOrigins: [PREVIEW_ORIGIN] },
    }),
  });
  server = await start(ctx);
});

test.afterAll(async () => {
  await server?.close();
});

test('app shell loads and authenticates to a protected route via the bearer path', async ({
  page,
}) => {
  if (!server) throw new Error('server failed to start');

  // Hand the app its runtime config (server URL + bearer token) BEFORE any app code runs.
  await page.addInitScript(
    (config) => {
      (window as unknown as { __SWITCHBOARD_CONFIG__?: unknown }).__SWITCHBOARD_CONFIG__ = config;
    },
    { serverUrl: server.url, bearerToken: TEST_BEARER_TOKEN },
  );

  await page.goto('/');

  // The mobile-first shell renders.
  await expect(page.getByTestId('app-shell')).toBeVisible();

  // The protected cloned-repositories route round-trips: with no repositories cloned the home
  // resolves to its empty clone CTA — only possible if the bearer token was attached and accepted
  // by the auth gate (an auth failure would instead surface the home's error state).
  await expect(page.getByTestId('repos-home-empty')).toBeVisible();
  await expect(page.getByTestId('repos-home-error')).toHaveCount(0);
});
