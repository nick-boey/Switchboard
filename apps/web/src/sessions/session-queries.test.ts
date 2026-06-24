import { describe, expect, it, vi } from 'vitest';
import type { SwitchboardClient } from '../api/client';
import { fetchLiveSessions, requestLaunch, requestStop } from './session-queries';

/**
 * Session query/mutation builder tests (task 9.1). They talk to the API through the typed client
 * shape — the liveness query returns the set of live `<wt-id>`s for a repo, and the launch/stop
 * mutations hit the right routes. A minimal fake client stands in for the `hc` client.
 */
function fakeClient(overrides: {
  list?: () => Promise<unknown>;
  launch?: (body: unknown) => Promise<unknown>;
  stop?: (body: unknown) => Promise<unknown>;
}): { client: SwitchboardClient; launchArg: () => unknown; stopArg: () => unknown } {
  let launchArg: unknown;
  let stopArg: unknown;
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const client = {
    sessions: {
      launch: {
        $post: async (arg: { json: unknown }) => {
          launchArg = arg.json;
          return overrides.launch
            ? overrides.launch(arg.json)
            : ok({ repoId: 'session/acme/infra/x', operationId: 'op-1', status: 'cloning' });
        },
      },
      stop: {
        $post: async (arg: { json: unknown }) => {
          stopArg = arg.json;
          return overrides.stop ? overrides.stop(arg.json) : ok({ status: 'stopped' });
        },
      },
      ':owner': {
        ':repo': {
          $get: async () =>
            overrides.list
              ? overrides.list()
              : ok({
                  repoId: 'acme/infra',
                  sessions: [
                    { repoId: 'acme/infra', wtId: 'a--0123456789ab', status: 'on' },
                    { repoId: 'acme/infra', wtId: 'b--abcdef012345', status: 'on' },
                  ],
                }),
        },
      },
    },
  } as unknown as SwitchboardClient;
  return { client, launchArg: () => launchArg, stopArg: () => stopArg };
}

describe('fetchLiveSessions', () => {
  it('returns the set of live wt-ids for a repo', async () => {
    const { client } = fakeClient({});
    const live = await fetchLiveSessions(client, 'acme/infra');
    expect(live).toEqual(new Set(['a--0123456789ab', 'b--abcdef012345']));
  });

  it('throws on a non-ok response', async () => {
    const { client } = fakeClient({ list: async () => ({ ok: false, status: 500 }) });
    await expect(fetchLiveSessions(client, 'acme/infra')).rejects.toThrow();
  });
});

describe('requestLaunch / requestStop', () => {
  it('launch posts { repoId, wtId } and returns the operation status', async () => {
    const fake = fakeClient({});
    const status = await requestLaunch(fake.client, 'acme/infra', 'x--0123456789ab');
    expect(fake.launchArg()).toEqual({ repoId: 'acme/infra', wtId: 'x--0123456789ab' });
    expect(status).toMatchObject({ status: 'cloning' });
  });

  it('stop posts { repoId, wtId } and resolves on success', async () => {
    const fake = fakeClient({});
    await expect(
      requestStop(fake.client, 'acme/infra', 'x--0123456789ab'),
    ).resolves.toBeUndefined();
    expect(fake.stopArg()).toEqual({ repoId: 'acme/infra', wtId: 'x--0123456789ab' });
  });

  it('launch throws on a non-ok response', async () => {
    const spy = vi.fn();
    const fake = fakeClient({
      launch: async () => {
        spy();
        return { ok: false, status: 422 };
      },
    });
    await expect(requestLaunch(fake.client, 'acme/infra', 'x--0123456789ab')).rejects.toThrow();
    expect(spy).toHaveBeenCalled();
  });
});
