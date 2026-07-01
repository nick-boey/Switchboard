import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSwitchboardClient } from './client';

/**
 * serve-web-spa (web-app-serving): the served SPA calls the API under the `/api` namespace and
 * omits the `Authorization` header when no token is configured (serve identity authorises — no
 * secret in the browser). An injected token (the local `just run` dev path) is still sent.
 */
describe('createSwitchboardClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  function captureFetch(): { url?: string; headers?: Headers } {
    const captured: { url?: string; headers?: Headers } = {};
    vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) => {
      captured.url = String(input);
      captured.headers = new Headers(init?.headers as HeadersInit | undefined);
      return Promise.resolve(
        new Response('{"repos":[]}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    return captured;
  }

  it('omits the Authorization header when no token is configured, and targets /api', async () => {
    const captured = captureFetch();
    const client = createSwitchboardClient({ serverUrl: 'http://server.test', bearerToken: '' });
    await client.api.repos.cloned.$get();
    expect(captured.headers?.has('authorization')).toBe(false);
    expect(captured.url).toContain('/api/repos/cloned');
  });

  it('sends the bearer token when one is configured (the just run dev path)', async () => {
    const captured = captureFetch();
    const client = createSwitchboardClient({
      serverUrl: 'http://server.test',
      bearerToken: 'tok-abc',
    });
    await client.api.repos.cloned.$get();
    expect(captured.headers?.get('authorization')).toBe('Bearer tok-abc');
  });
});
