import { afterEach, describe, expect, it } from 'vitest';
import { firstNonLoopbackIPv4, startDualIngress, type DualIngressFixture } from './dual-ingress';

/**
 * Self-test for the dual-ingress helper (task 1.1): it round-trips `/health` on each port and lets
 * a test observe which ingress a request arrived on (by targeting a known, distinct port).
 */
describe('dual-ingress test helper', () => {
  let fixture: DualIngressFixture | undefined;

  afterEach(async () => {
    if (fixture) await fixture.close();
    fixture = undefined;
  });

  it('binds two distinct loopback ports and serves /health on each', async () => {
    fixture = await startDualIngress();

    expect(fixture.directUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(fixture.serveUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // Two SEPARATE listeners — distinct ports.
    expect(fixture.directUrl).not.toBe(fixture.serveUrl);

    for (const url of [fixture.directUrl, fixture.serveUrl]) {
      const res = await fetch(`${url}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    }
  });

  it('observes which ingress a request arrived on (distinct ports are addressable)', async () => {
    fixture = await startDualIngress();
    const directPort = new URL(fixture.directUrl).port;
    const servePort = new URL(fixture.serveUrl).port;
    expect(directPort).not.toBe(servePort);
    // handle.urls mirrors the helper's resolved URLs.
    expect(fixture.handle.urls.direct).toBe(fixture.directUrl);
    expect(fixture.handle.urls.serve).toBe(fixture.serveUrl);
  });

  it('binds loopback only (refuses a non-loopback interface)', async () => {
    fixture = await startDualIngress();
    const external = firstNonLoopbackIPv4();
    if (!external) return; // host has no external IPv4 — nothing to prove
    for (const url of [fixture.directUrl, fixture.serveUrl]) {
      const port = new URL(url).port;
      await expect(
        fetch(`http://${external}:${port}/health`, { signal: AbortSignal.timeout(500) }),
      ).rejects.toThrow();
    }
  });

  it('close() releases BOTH listeners', async () => {
    const f = await startDualIngress();
    const { directUrl, serveUrl } = f;
    await f.close();
    fixture = undefined;

    for (const url of [directUrl, serveUrl]) {
      await expect(fetch(`${url}/health`, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
    }
  });
});
