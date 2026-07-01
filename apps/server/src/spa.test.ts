import { afterEach, describe, expect, it } from 'vitest';
import {
  makeTestContext,
  makeWebBundleFixture,
  type WebBundleFixture,
} from '@switchboard/shared/testing';
import { createApp } from './app';

const TOKEN = 'test-bearer-token';

/**
 * Public SPA static serving + `index.html` history fallback (serve-web-spa web-app-serving). The
 * bundle is served ahead of and OUTSIDE the auth gate (it carries no secrets); SPA serving is
 * opt-in by a configured `webRoot`, with a defined `503` when the bundle is absent.
 */
describe('public SPA static serving + history fallback (web-app-serving)', () => {
  let fixture: WebBundleFixture | undefined;
  afterEach(() => {
    fixture?.cleanup();
    fixture = undefined;
  });

  function appWithBundle(opts: { omitIndex?: boolean } = {}): {
    app: ReturnType<typeof createApp>;
  } {
    fixture = makeWebBundleFixture(opts);
    return { app: createApp(makeTestContext({ webRoot: fixture.webRoot })) };
  }

  it('GET / serves the SPA shell without authentication', async () => {
    const { app } = appWithBundle();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(fixture!.indexMarker);
  });

  it('serves an existing static asset by path, unauthenticated', async () => {
    const { app } = appWithBundle();
    const res = await app.request(fixture!.assetPath);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(fixture!.assetBody.trim());
  });

  it('a clean deep-link path falls back to index.html on load/reload (no auth)', async () => {
    const { app } = appWithBundle();
    for (const path of ['/acme/infra', '/new-repo']) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain(fixture!.indexMarker);
    }
  });

  it('a non-GET request outside /api is not served the SPA (404)', async () => {
    const { app } = appWithBundle();
    const res = await app.request('/new-repo', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('with no web bundle configured the server is API-only (non-/api → 404; /api + /health intact)', async () => {
    const app = createApp(makeTestContext()); // no webRoot
    expect((await app.request('/')).status).toBe(404);
    expect((await app.request('/new-repo')).status).toBe(404);
    expect((await app.request('/health')).status).toBe(200);
    const api = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(api.status).toBe(401); // still gated, not served the SPA
  });

  it('with a configured but MISSING bundle, non-/api requests → 503 and /api is unaffected', async () => {
    const { app } = appWithBundle({ omitIndex: true });
    expect((await app.request('/')).status).toBe(503);
    expect((await app.request('/new-repo')).status).toBe(503);
    expect((await app.request('/health')).status).toBe(200);
    const api = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(api.status).toBe(200);
  });
});
