import { test, expect } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTestContext } from '@switchboard/shared/testing';
import type { ServerHandle } from '@switchboard/shared';
import { start } from '../apps/server/dist/index.js';

/**
 * serve-web-spa (task 1.2 + 8.1): the PRODUCTION fallback surface `page-routing` hands off. Boots the
 * BUILT server against the BUILT `apps/web/dist` (as `webRoot`) and asserts the real production
 * behaviour: `GET /` and a clean deep-link reload both return `index.html` (the history fallback), and
 * an unauthenticated `GET /api/...` is `401` (gated as API, never served the SPA). This discharges
 * page-routing's archive-gate obligation (deep-linked/reloaded clean paths must not 404 in production).
 */
const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'dist');

let server: ServerHandle;

test.beforeAll(async () => {
  server = await start(makeTestContext({ webRoot: WEB_DIST }));
});

test.afterAll(async () => {
  await server?.close();
});

test('production fallback: GET / and a deep-link reload return index.html; /api unauth → 401', async () => {
  // GET / → the SPA shell (no auth).
  const root = await fetch(`${server.url}/`);
  expect(root.status).toBe(200);
  expect(await root.text()).toContain('<div id="root">');

  // A clean deep-link path, loaded/reloaded directly → index.html history fallback (no 404).
  const deepLink = await fetch(`${server.url}/acme/infra`);
  expect(deepLink.status).toBe(200);
  expect(await deepLink.text()).toContain('<div id="root">');

  // The API namespace stays gated: an unauthenticated /api request is 401, never the SPA.
  const api = await fetch(`${server.url}/api/repos/cloned`);
  expect(api.status).toBe(401);
  expect(api.headers.get('content-type') ?? '').not.toContain('text/html');
});
