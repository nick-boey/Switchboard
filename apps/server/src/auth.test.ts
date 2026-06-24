import { describe, expect, it } from 'vitest';
import { configSchema, type AppConfig } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import { createApp } from './app';
import { DIRECT_INGRESS_TRUST, serveIngressTrust } from './auth';

const TOKEN = 'test-bearer-token';
const APP_ORIGIN = 'http://localhost:5173';

function ctxWith(
  overrides: Partial<Record<string, unknown>> = {},
  assertNoHostPublication?: boolean,
) {
  const config: AppConfig = configSchema.parse({
    bearerToken: TOKEN,
    cors: { allowedOrigins: [APP_ORIGIN] },
    ...overrides,
  });
  return makeTestContext({ config, assertNoHostPublication });
}

/** An app mounted as the DIRECT/local loopback-TCP ingress (always bearer-only, Decision 3). */
function directApp(overrides: Partial<Record<string, unknown>> = {}) {
  return createApp(ctxWith(overrides), { ingress: DIRECT_INGRESS_TRUST });
}

/**
 * An app mounted as the DEDICATED SERVE ingress — its bind-time identity eligibility is COMPUTED
 * via `serveIngressTrust(ctx)` (`trustServeIdentity ∧ no-host-publication`), exactly as `start`
 * computes it, so these tests exercise the real eligibility rule, not a hand-set flag.
 * `assertNoHostPublication` defaults to `true` (the container-isolated runtime); pass `false` for
 * the host-reachable serve-port case.
 */
function serveApp(
  overrides: Partial<Record<string, unknown>> = {},
  assertNoHostPublication = true,
) {
  const ctx = ctxWith(overrides, assertNoHostPublication);
  return createApp(ctx, { ingress: serveIngressTrust(ctx) });
}

/** The default app build (no ingress option) — proves the spoof-safe default is bearer-only. */
function appWith(overrides: Partial<Record<string, unknown>> = {}) {
  return createApp(ctxWith(overrides));
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

  // --- Ingress-scoped identity trust (runtime-cli-docker Decision 3) -----------------------------

  it('serve ingress, trust ON + container-isolated: allowlisted identity → allow WITHOUT a bearer', async () => {
    const res = await serveApp({
      trustServeIdentity: true,
      identityAllowlist: ['nick-boey@github'],
    }).request('/echo', postEcho(serveMarkers('nick-boey@github')));
    expect(res.status).toBe(200);
  });

  it('serve ingress, trust ON: non-allowlisted identity → 403', async () => {
    const res = await serveApp({ trustServeIdentity: true }).request(
      '/echo',
      postEcho(serveMarkers('eve@evil')),
    );
    expect(res.status).toBe(403);
  });

  it('trust OFF (default): identity headers ignored on the serve ingress → 401 (spoof-safe)', async () => {
    const res = await serveApp({ trustServeIdentity: false }).request(
      '/echo',
      postEcho(serveMarkers('nick-boey@github')),
    );
    expect(res.status).toBe(401);
  });

  it('trust OFF (default): identity headers ignored on the direct ingress → 401 (spoof-safe)', async () => {
    const res = await directApp({ trustServeIdentity: false }).request(
      '/echo',
      postEcho(serveMarkers('nick-boey@github')),
    );
    expect(res.status).toBe(401);
  });

  // Spoof-close regression (the load-bearing test): the SAME serve markers + allowlisted login that
  // are admitted on the serve ingress are REJECTED on the direct loopback ingress (bearer-only) —
  // a forged header on the direct path grants nothing.
  it('spoof-close: trust ON, serve markers + allowlisted login on the DIRECT ingress → 401', async () => {
    const res = await directApp({
      trustServeIdentity: true,
      identityAllowlist: ['nick-boey@github'],
    }).request('/echo', postEcho(serveMarkers('nick-boey@github')));
    expect(res.status).toBe(401);
  });

  it('spoof-close: the direct ingress still admits the same request with a valid bearer', async () => {
    const res = await directApp({
      trustServeIdentity: true,
      identityAllowlist: ['nick-boey@github'],
    }).request(
      '/echo',
      postEcho({ ...serveMarkers('nick-boey@github'), authorization: `Bearer ${TOKEN}` }),
    );
    expect(res.status).toBe(200);
  });

  // Host-reachable serve-port negative (task 4.3): a serve ingress bound WITHOUT the
  // container-isolation assertion is NOT identity-eligible — forged markers grant nothing even with
  // trust enabled; a valid bearer is still required.
  it('host-reachable serve ingress (no no-host-publication assertion): identity NOT admitted → 401', async () => {
    const res = await serveApp(
      { trustServeIdentity: true, identityAllowlist: ['nick-boey@github'] },
      false, // host-reachable: no container-isolation assertion
    ).request('/echo', postEcho(serveMarkers('nick-boey@github')));
    expect(res.status).toBe(401);
  });

  it('host-reachable serve ingress: a valid bearer is still admitted', async () => {
    const res = await serveApp(
      { trustServeIdentity: true, identityAllowlist: ['nick-boey@github'] },
      false,
    ).request(
      '/echo',
      postEcho({ ...serveMarkers('nick-boey@github'), authorization: `Bearer ${TOKEN}` }),
    );
    expect(res.status).toBe(200);
  });

  // The default app build (no ingress option) is bearer-only — the spoof-safe default.
  it('default app build: serve markers + allowlisted identity ignored → 401', async () => {
    const res = await appWith({ trustServeIdentity: true }).request(
      '/echo',
      postEcho(serveMarkers('nick-boey@github')),
    );
    expect(res.status).toBe(401);
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
