import { afterEach, describe, expect, it } from 'vitest';
import { makeTestContext } from '@switchboard/shared/testing';
import type {
  OperationStatus,
  RepoListResponse,
  RepoTarget,
  ServerHandle,
} from '@switchboard/shared';
import { start } from '../server.js';
import { createServerClient, type ServerClient } from '../client.js';
import type { CloneOrchestrator } from './clone.js';

/**
 * Failing-first tests for the repo routes + typed client (task 7.1). Zod validation (invalid →
 * 422, handler not invoked) and the abort route's terminal-status reporting, exercised through the
 * typed `hc` client against a real `start(ctx)` server with an injected fake orchestrator.
 */
describe('repo routes + typed client', () => {
  let handle: ServerHandle | undefined;
  const token = 'test-bearer-token';

  /** A configurable fake orchestrator that records whether each handler ran. */
  function makeFake() {
    const calls = { start: 0, abort: 0, status: 0, cloned: 0 };
    let startResult: OperationStatus = {
      repoId: 'acme/infra',
      operationId: 'op-1',
      status: 'cloning',
    };
    let abortResult: OperationStatus | null = {
      repoId: 'acme/infra',
      operationId: 'op-1',
      status: 'aborted',
    };
    let statusResult: OperationStatus | null = null;
    const cloned: RepoTarget[] = [{ owner: 'acme', repo: 'infra' }];
    const orchestrator: CloneOrchestrator = {
      async startClone() {
        calls.start += 1;
        return startResult;
      },
      async abortClone() {
        calls.abort += 1;
        return abortResult;
      },
      async getStatus() {
        calls.status += 1;
        return statusResult;
      },
      async listCloned() {
        calls.cloned += 1;
        return cloned;
      },
      async reconcile() {},
      async whenSettled() {
        return statusResult;
      },
    };
    return {
      calls,
      orchestrator,
      set startResult(v: OperationStatus) {
        startResult = v;
      },
      set abortResult(v: OperationStatus | null) {
        abortResult = v;
      },
      set statusResult(v: OperationStatus | null) {
        statusResult = v;
      },
    };
  }

  let listGitHubResult: RepoListResponse = { status: 'not-configured' };

  async function boot(orchestrator: CloneOrchestrator): Promise<ServerClient> {
    handle = await start(makeTestContext(), {
      repos: { orchestrator, listGitHub: async () => listGitHubResult },
    });
    return createServerClient(handle.url, { headers: { Authorization: `Bearer ${token}` } });
  }

  afterEach(async () => {
    if (handle) await handle.close();
    handle = undefined;
    listGitHubResult = { status: 'not-configured' };
  });

  it('clone: rejects invalid input with 422 without invoking the handler', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.repos.clone.$post({ json: { target: '../evil' } });
    expect(res.status).toBe(422);
    expect(fake.calls.start).toBe(0);
  });

  it('clone: starts a clone and returns the cloning status', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.repos.clone.$post({ json: { target: 'acme/infra' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ repoId: 'acme/infra', status: 'cloning' });
    expect(fake.calls.start).toBe(1);
  });

  it('abort: rejects a malformed repoId with 422 without invoking the handler', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.repos.abort.$post({ json: { repoId: '../evil' } });
    expect(res.status).toBe(422);
    expect(fake.calls.abort).toBe(0);
  });

  it('abort: aborts an in-flight clone and responds with the aborted status', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.repos.abort.$post({ json: { repoId: 'acme/infra' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'aborted' });
  });

  it('abort: a clone that completed as the abort arrived reports ready, no termination', async () => {
    const fake = makeFake();
    fake.abortResult = { repoId: 'acme/infra', operationId: 'op-1', status: 'ready' };
    const client = await boot(fake.orchestrator);
    const res = await client.repos.abort.$post({ json: { repoId: 'acme/infra' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ready' });
  });

  it('abort: an unknown operation reports not-found', async () => {
    const fake = makeFake();
    fake.abortResult = null;
    fake.statusResult = null;
    const client = await boot(fake.orchestrator);
    const res = await client.repos.abort.$post({ json: { repoId: 'ghost/repo' } });
    expect(res.status).toBe(404);
  });

  it('status: reports the operation status, 404 when unknown', async () => {
    const fake = makeFake();
    fake.statusResult = { repoId: 'acme/infra', operationId: 'op-1', status: 'ready' };
    const client = await boot(fake.orchestrator);
    const ok = await client.repos[':owner'][':repo'].status.$get({
      param: { owner: 'acme', repo: 'infra' },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: 'ready' });
  });

  it('cloned: lists completed clones', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.repos.cloned.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ repos: [{ owner: 'acme', repo: 'infra' }] });
  });

  it('github: returns the repo-list response from the lister', async () => {
    const fake = makeFake();
    listGitHubResult = {
      status: 'ok',
      owners: [{ login: 'acme', kind: 'organisation' }],
      repositories: [{ owner: 'acme', name: 'infra' }],
    };
    const client = await boot(fake.orchestrator);
    const res = await client.repos.github.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });
});
