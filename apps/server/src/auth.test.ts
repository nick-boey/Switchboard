import { describe, expect, it } from 'vitest';
import { configSchema, type AppConfig } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import { createApp } from './app';

const TOKEN = 'test-bearer-token';
const APP_ORIGIN = 'http://localhost:5173';

function appWith(overrides: Partial<Record<string, unknown>> = {}) {
  const config: AppConfig = configSchema.parse({
    bearerToken: TOKEN,
    cors: { allowedOrigins: [APP_ORIGIN] },
    ...overrides,
  });
  return createApp(makeTestContext({ config }));
}

/** A request carrying the full Tailscale serve markers for `login` (CGNAT x-forwarded-for). */
function serveMarkers(login: string): Record<string, string> {
  return {
    'tailscale-user-login': login,
    'tailscale-headers-info': 'logins=1;caps=0',
    'x-forwarded-for': '100.100.50.1',
  };
}

function postEcho(headers: Record<string, string>) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ message: 'hi' }),
  };
}

describe('auth gate', () => {
  it('GET /health is reachable unauthenticated', async () => {
    const res = await appWith().request('/health');
    expect(res.status).toBe(200);
  });

  it('protected route with no credentials → 401', async () => {
    const res = await appWith().request('/echo', postEcho({}));
    expect(res.status).toBe(401);
  });

  it('valid bearer token → allow', async () => {
    const res = await appWith().request('/echo', postEcho({ authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
  });

  it('invalid bearer token → 401', async () => {
    const res = await appWith().request('/echo', postEcho({ authorization: 'Bearer nope' }));
    expect(res.status).toBe(401);
  });

  it('trust ON: allowlisted serve identity → allow WITHOUT a bearer token', async () => {
    const res = await appWith({
      trustServeIdentity: true,
      identityAllowlist: ['nick-boey@github'],
    }).request('/echo', postEcho(serveMarkers('nick-boey@github')));
    expect(res.status).toBe(200);
  });

  it('trust ON: non-allowlisted serve identity → 403', async () => {
    const res = await appWith({ trustServeIdentity: true }).request(
      '/echo',
      postEcho(serveMarkers('eve@evil')),
    );
    expect(res.status).toBe(403);
  });

  it('trust OFF (default): full markers + allowlisted identity → rejected 401 (spoof-safe)', async () => {
    const res = await appWith({ trustServeIdentity: false }).request(
      '/echo',
      postEcho(serveMarkers('nick-boey@github')),
    );
    expect(res.status).toBe(401);
  });

  it('trust OFF: full markers + allowlisted identity + valid bearer → allowed via bearer only', async () => {
    const res = await appWith({ trustServeIdentity: false }).request(
      '/echo',
      postEcho({ ...serveMarkers('nick-boey@github'), authorization: `Bearer ${TOKEN}` }),
    );
    expect(res.status).toBe(200);
  });
});

describe('strict CORS', () => {
  it('denies a disallowed origin (no permissive allow-origin header)', async () => {
    const res = await appWith().request('/echo', {
      method: 'OPTIONS',
      headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows the configured app origin', async () => {
    const res = await appWith().request('/echo', {
      method: 'OPTIONS',
      headers: { origin: APP_ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
  });

  it('passes a no-Origin request through to the auth rules', async () => {
    // No Origin header → CORS must not block; auth still applies (no creds → 401).
    const res = await appWith().request('/echo', postEcho({}));
    expect(res.status).toBe(401);
  });
});
