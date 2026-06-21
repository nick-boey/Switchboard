import { afterEach, describe, expect, it } from 'vitest';
import { networkInterfaces } from 'node:os';
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
