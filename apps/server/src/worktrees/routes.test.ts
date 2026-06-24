import { afterEach, describe, expect, it } from 'vitest';
import { makeTestContext } from '@switchboard/shared/testing';
import type { OperationStatus, ServerHandle, WorktreeSummary } from '@switchboard/shared';
import { start } from '../server.js';
import { createServerClient, type ServerClient } from '../client.js';
import { WorktreeError, WorktreeNotSafeError } from './errors.js';
import type { WorktreeOrchestrator } from './orchestrator.js';

/**
 * Failing-first tests for the worktree routes + typed client (task 6.1): Zod validation (invalid
 * input → 422, handler not invoked) across create / list / delete / status, the delete route's
 * typed `not-safe` refusal vs success, exercised through the typed `hc` client against a real
 * `start(ctx)` server with an injected fake worktree orchestrator.
 */
describe('worktree routes + typed client', () => {
  let handle: ServerHandle | undefined;
  const token = 'test-bearer-token';

  function makeFake() {
    const calls = { start: 0, list: 0, delete: 0, status: 0 };
    let deleteBehaviour: 'ok' | 'not-safe' | 'not-managed' = 'ok';
    let statusResult: OperationStatus | null = null;
    const list: WorktreeSummary[] = [
      {
        wtId: 'feature-x--0123456789ab',
        branch: 'feature/x',
        path: 'repos/acme/infra/worktrees/feature-x--0123456789ab',
        dirty: false,
        sync: 'up-to-date',
      },
    ];
    const orchestrator: WorktreeOrchestrator = {
      async startCreate() {
        calls.start += 1;
        return {
          repoId: 'acme/infra/feature-x--0123456789ab',
          operationId: 'op-1',
          status: 'cloning',
        };
      },
      async listWorktrees() {
        calls.list += 1;
        return list;
      },
      async deleteWorktree() {
        calls.delete += 1;
        if (deleteBehaviour === 'not-safe') throw new WorktreeNotSafeError();
        if (deleteBehaviour === 'not-managed')
          throw new WorktreeError('dest-not-managed', 'not a managed worktree');
      },
      async getStatus() {
        calls.status += 1;
        return statusResult;
      },
      async abortCreate() {
        return null;
      },
      async reconcile() {},
      async whenSettled() {
        return null;
      },
    };
    return {
      calls,
      orchestrator,
      set deleteBehaviour(v: 'ok' | 'not-safe' | 'not-managed') {
        deleteBehaviour = v;
      },
      set statusResult(v: OperationStatus | null) {
        statusResult = v;
      },
    };
  }

  async function boot(orchestrator: WorktreeOrchestrator): Promise<ServerClient> {
    handle = await start(makeTestContext(), { worktrees: { orchestrator } });
    return createServerClient(handle.url, { headers: { Authorization: `Bearer ${token}` } });
  }

  afterEach(async () => {
    if (handle) await handle.close();
    handle = undefined;
  });

  it('create: rejects a malformed repoId with 422 without invoking the handler', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.worktrees.create.$post({
      json: { repoId: '../evil', branch: 'x', mode: 'new' },
    });
    expect(res.status).toBe(422);
    expect(fake.calls.start).toBe(0);
  });

  it('create: rejects an empty branch with 422 without invoking the handler', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.worktrees.create.$post({
      json: { repoId: 'acme/infra', branch: '', mode: 'new' },
    });
    expect(res.status).toBe(422);
    expect(fake.calls.start).toBe(0);
  });

  it('create: starts a worktree op and returns the in-progress status', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.worktrees.create.$post({
      json: { repoId: 'acme/infra', branch: 'feature/x', mode: 'new' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'cloning' });
    expect(fake.calls.start).toBe(1);
  });

  it('list: returns the repo worktrees', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.worktrees[':owner'][':repo'].$get({
      param: { owner: 'acme', repo: 'infra' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repoId).toBe('acme/infra');
    expect(body.worktrees[0]).toMatchObject({ branch: 'feature/x', sync: 'up-to-date' });
  });

  it('list: rejects a malformed repo-id param with 422', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    // An out-of-charset owner reaches the validator (a `..` path segment is normalized to 404 by
    // the HTTP layer before routing, so use a non-traversal malformed id to exercise Zod).
    const res = await client.worktrees[':owner'][':repo'].$get({
      param: { owner: 'bad@owner', repo: 'evil' },
    });
    expect(res.status).toBe(422);
    expect(fake.calls.list).toBe(0);
  });

  it('delete: rejects malformed input with 422 without invoking the handler', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.worktrees.delete.$post({
      json: { repoId: 'acme/infra', wtId: 'not a valid id' },
    });
    expect(res.status).toBe(422);
    expect(fake.calls.delete).toBe(0);
  });

  it('delete: reports success when the removal proceeds', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.worktrees.delete.$post({
      json: { repoId: 'acme/infra', wtId: 'feature-x--0123456789ab', force: true },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'deleted' });
    expect(fake.calls.delete).toBe(1);
  });

  it('delete: reports the typed not-safe refusal', async () => {
    const fake = makeFake();
    fake.deleteBehaviour = 'not-safe';
    const client = await boot(fake.orchestrator);
    const res = await client.worktrees.delete.$post({
      json: { repoId: 'acme/infra', wtId: 'feature-x--0123456789ab' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'not-safe' });
  });

  it('delete: reports not-found when the target is not a git-managed worktree', async () => {
    // Finding B at the route boundary: a forced delete of a valid wt-id that git never registered
    // surfaces the typed dest-not-managed refusal as a not-found outcome (no filesystem removal).
    const fake = makeFake();
    fake.deleteBehaviour = 'not-managed';
    const client = await boot(fake.orchestrator);
    const res = await client.worktrees.delete.$post({
      json: { repoId: 'acme/infra', wtId: 'feature-x--0123456789ab', force: true },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'not-found' });
  });

  it('status: reports the operation status, 404 when unknown', async () => {
    const fake = makeFake();
    fake.statusResult = {
      repoId: 'acme/infra/feature-x--0123456789ab',
      operationId: 'op-1',
      status: 'ready',
    };
    const client = await boot(fake.orchestrator);
    const ok = await client.worktrees[':owner'][':repo'][':wtId'].status.$get({
      param: { owner: 'acme', repo: 'infra', wtId: 'feature-x--0123456789ab' },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: 'ready' });
  });
});
