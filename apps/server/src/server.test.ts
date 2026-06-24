import { afterEach, describe, expect, it } from 'vitest';
import { networkInterfaces } from 'node:os';
import { configSchema } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import type { ServerHandle } from '@switchboard/shared';
import { start } from './server';

function firstNonLoopbackIPv4(): string | undefined {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return undefined;
}

/** A context whose listen spec carries both the direct ingress and a dedicated serve ingress. */
function dualIngressContext() {
  return makeTestContext({
    config: configSchema.parse({
      bearerToken: 'test-bearer-token',
      listen: { direct: { port: 0 }, serve: { port: 0 } },
    }),
  });
}

describe('start(ctx) lifecycle', () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    if (handle) await handle.close();
    handle = undefined;
  });

  it('boots on 127.0.0.1 and serves GET /health unauthenticated → 200', async () => {
    handle = await start(makeTestContext());
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const res = await fetch(`${handle.url}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('is bound to loopback only (not any non-loopback interface)', async () => {
    handle = await start(makeTestContext());
    const url = new URL(handle.url);
    const port = Number(url.port);

    // Bound to loopback host.
    expect(url.hostname).toBe('127.0.0.1');
    expect((await fetch(`${handle.url}/health`)).status).toBe(200);

    // If the host has a real (non-loopback) interface, a loopback-only bind must refuse it.
    const external = firstNonLoopbackIPv4();
    if (external) {
      await expect(
        fetch(`http://${external}:${port}/health`, { signal: AbortSignal.timeout(500) }),
      ).rejects.toThrow();
    }
  });

  it('close() releases the port (graceful shutdown)', async () => {
    const h = await start(makeTestContext());
    const url = h.url;
    await h.close();
    handle = undefined;

    await expect(fetch(`${url}/health`, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
  });
});

describe('start(ctx) dedicated serve ingress (runtime-cli-docker Decision 2)', () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    if (handle) await handle.close();
    handle = undefined;
  });

  it('listens on the serve ingress own loopback port and serves /health 200 on it', async () => {
    handle = await start(dualIngressContext());

    expect(handle.urls.direct).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(handle.urls.serve).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // Distinct from the direct ingress — a SEPARATE listener on its own port.
    expect(handle.urls.serve).not.toBe(handle.urls.direct);
    // `url` keeps reporting the direct loopback URL when a direct ingress is present.
    expect(handle.url).toBe(handle.urls.direct);

    expect((await fetch(`${handle.urls.serve}/health`)).status).toBe(200);
    expect((await fetch(`${handle.urls.direct}/health`)).status).toBe(200);
  });

  it('serve-only spec: url falls back to the serve ingress and /health 200 on it', async () => {
    handle = await start(
      makeTestContext({
        config: configSchema.parse({
          bearerToken: 'test-bearer-token',
          listen: { serve: { port: 0 } },
        }),
      }),
    );
    expect(handle.urls.direct).toBeUndefined();
    expect(handle.urls.serve).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(handle.url).toBe(handle.urls.serve);
    expect((await fetch(`${handle.urls.serve}/health`)).status).toBe(200);
  });

  it('both ingresses bind loopback only (no non-loopback bind)', async () => {
    handle = await start(dualIngressContext());
    const external = firstNonLoopbackIPv4();
    if (!external) return;
    for (const url of [handle.urls.direct!, handle.urls.serve!]) {
      const port = new URL(url).port;
      await expect(
        fetch(`http://${external}:${port}/health`, { signal: AbortSignal.timeout(500) }),
      ).rejects.toThrow();
    }
  });

  it('close() releases EVERY listener (both ingresses)', async () => {
    const h = await start(dualIngressContext());
    const direct = h.urls.direct!;
    const serve = h.urls.serve!;
    await h.close();
    handle = undefined;

    for (const url of [direct, serve]) {
      await expect(fetch(`${url}/health`, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
    }
  });
});
