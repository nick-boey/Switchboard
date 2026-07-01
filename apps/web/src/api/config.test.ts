import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRuntimeConfig } from './config';

/**
 * serve-web-spa (web-app-serving): the served SPA reaches its API SAME-ORIGIN and TOKENLESS. When
 * nothing is injected, `serverUrl` defaults to the page origin (never empty, so `hc` always has a
 * valid base) and the token is empty (serve identity authorises). Injected config / Vite env (the
 * local `just run` dev path) still take precedence.
 */
describe('readRuntimeConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('defaults serverUrl to window.location.origin when nothing is injected (tokenless)', () => {
    vi.stubEnv('VITE_SERVER_URL', undefined);
    vi.stubEnv('VITE_BEARER_TOKEN', undefined);
    vi.stubGlobal('window', { location: { origin: 'https://switchboard.tail.ts.net' } });
    const cfg = readRuntimeConfig();
    expect(cfg.serverUrl).toBe('https://switchboard.tail.ts.net');
    expect(cfg.bearerToken).toBe('');
  });

  it('injected window config takes precedence over the origin default', () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://switchboard.tail.ts.net' },
      __SWITCHBOARD_CONFIG__: { serverUrl: 'http://127.0.0.1:9000', bearerToken: 'tok-123' },
    });
    const cfg = readRuntimeConfig();
    expect(cfg.serverUrl).toBe('http://127.0.0.1:9000');
    expect(cfg.bearerToken).toBe('tok-123');
  });

  it('injected Vite env (the just run dev path) takes precedence over the origin default', () => {
    vi.stubEnv('VITE_SERVER_URL', 'http://127.0.0.1:5000');
    vi.stubEnv('VITE_BEARER_TOKEN', 'dev-token');
    vi.stubGlobal('window', { location: { origin: 'https://switchboard.tail.ts.net' } });
    const cfg = readRuntimeConfig();
    expect(cfg.serverUrl).toBe('http://127.0.0.1:5000');
    expect(cfg.bearerToken).toBe('dev-token');
  });
});
