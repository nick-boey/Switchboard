import { afterEach, describe, expect, it } from 'vitest';
import { makeTestContext } from '@switchboard/shared/testing';
import type { ServerHandle } from '@switchboard/shared';
import { start } from './server';
import { createServerClient } from './client';

/**
 * Contract tests (design Decision 4): exercise the typed `hc` client that mirrors the server
 * routes against a real `start(ctx)` server. The client is typed from the server's `AppType`,
 * so a route/schema change that breaks usage fails here (and `contract.ts` fails the build).
 */
describe('typed API contract', () => {
  let handle: ServerHandle | undefined;
  const token = 'test-bearer-token';

  async function bootClient() {
    handle = await start(makeTestContext());
    return createServerClient(handle.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  afterEach(async () => {
    if (handle) await handle.close();
    handle = undefined;
  });

  it('round-trips a valid request through the typed client', async () => {
    const client = await bootClient();
    const res = await client.echo.$post({ json: { message: 'hello' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'hello', length: 5 });
  });

  it('rejects an invalid body with 422 without invoking the handler', async () => {
    const client = await bootClient();
    // Empty message fails Zod; the handler (which would return `length`) must not run.
    const res = await client.echo.$post({ json: { message: '' } });
    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('length');
    expect(body).not.toHaveProperty('message');
  });
});
