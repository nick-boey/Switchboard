import { afterEach, describe, expect, it } from 'vitest';
import { networkInterfaces } from 'node:os';
import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { configSchema } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import type { AppConfig, ServerHandle } from '@switchboard/shared';
import { start } from './server';

/** Bind an ephemeral loopback listener, read its port, close it, and return the (now-free) port. */
async function freeLoopbackPort(): Promise<number> {
  const s = await new Promise<ServerType>((resolve) => {
    const server = serve({ fetch: () => new Response('x'), hostname: '127.0.0.1', port: 0 }, () =>
      resolve(server),
    );
  });
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((res) => s.close(() => res()));
  return port;
}

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
    const serveUrl = h.urls.serve!;
    await h.close();
    handle = undefined;

    for (const url of [direct, serveUrl]) {
      await expect(fetch(`${url}/health`, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
    }
  });

  it('close() tolerates an already-released listener and still resolves (crash-restart path)', async () => {
    // On the supervisor's crash-restart path a DUAL-listener handle's `whenClosed` fires when ONE
    // listener has already closed itself; the supervisor then calls `close()` to release the rest.
    // `close()` must tear every listener down and RESOLVE (not reject) even though a listener is
    // already gone — otherwise the supervisor sees a rejected teardown. Closing twice exercises that
    // already-closed path on every listener.
    const h = await start(dualIngressContext());
    await h.close();
    handle = undefined;

    await expect(h.close()).resolves.toBeUndefined();
  });
});

describe('start(ctx) partial dual-listener bind cleanup (impl review)', () => {
  it('closes the already-opened first listener when a later ingress fails to bind (no leak)', async () => {
    const port = await freeLoopbackPort();
    // A hand-built config (bypassing schema validation, which now rejects duplicate fixed ports)
    // that pins BOTH ingresses to the SAME fixed port: the direct listener binds, then the serve
    // listener hits EADDRINUSE — forcing the second-bind failure path.
    const base = configSchema.parse({ bearerToken: 'test-bearer-token' });
    const config: AppConfig = { ...base, listen: { direct: { port }, serve: { port } } };
    const ctx = makeTestContext({ config });

    await expect(start(ctx)).rejects.toThrow();

    // The first (direct) listener must have been closed on the failed bind — its port is free
    // again. Had it leaked, this rebind would itself fail with EADDRINUSE.
    const rebound = await new Promise<ServerType>((resolve, reject) => {
      const s = serve({ fetch: () => new Response('y'), hostname: '127.0.0.1', port }, () =>
        resolve(s),
      );
      s.on('error', reject);
    });
    await new Promise<void>((res) => rebound.close(() => res()));
  });
});
