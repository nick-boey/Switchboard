import { afterEach, describe, expect, it } from 'vitest';
import { makeTestContext } from '@switchboard/shared/testing';
import {
  idForBranch,
  type RepoTarget,
  type ServerHandle,
  type SessionLaunchStatus,
  type SessionSummary,
} from '@switchboard/shared';
import { start } from '../server.js';
import { createServerClient, type ServerClient } from '../client.js';
import type { SessionOrchestrator } from './orchestrator.js';

/**
 * Session route + typed-client tests (task 8.1, design Decision 4 / 8). Zod validation (a malformed
 * `<repo-id>` or `<wt-id>` → `422`, handler NOT invoked) and the shared response shapes, exercised
 * through the typed `hc` client against a real `start(ctx)` server with an injected fake session
 * orchestrator. Schema drift fails the build at `contract.ts`; this is the runtime round-trip.
 */
describe('session routes + typed client', () => {
  let handle: ServerHandle | undefined;
  const token = 'test-bearer-token';
  const REPO = 'acme/widget-factory';
  const WT_ID = idForBranch('feature/login');

  function makeFake() {
    const calls = { launch: 0, stop: 0, status: 0, list: 0 };
    let launchResult: SessionLaunchStatus = {
      repoId: `session/${REPO}/${WT_ID}`,
      operationId: 'op-1',
      status: 'starting',
    };
    let statusResult: SessionLaunchStatus | null = null;
    let listResult: SessionSummary[] = [{ repoId: REPO, wtId: WT_ID, status: 'on' }];
    const orchestrator: SessionOrchestrator = {
      async launchSession() {
        calls.launch += 1;
        return launchResult;
      },
      async stopSession() {
        calls.stop += 1;
      },
      async getLaunchStatus() {
        calls.status += 1;
        return statusResult;
      },
      async listSessions(_target: RepoTarget) {
        calls.list += 1;
        return listResult;
      },
      async whenSettled() {
        return statusResult;
      },
      async reconcile() {},
    };
    return {
      calls,
      orchestrator,
      set launchResult(v: SessionLaunchStatus) {
        launchResult = v;
      },
      set statusResult(v: SessionLaunchStatus | null) {
        statusResult = v;
      },
      set listResult(v: SessionSummary[]) {
        listResult = v;
      },
    };
  }

  async function boot(orchestrator: SessionOrchestrator): Promise<ServerClient> {
    handle = await start(makeTestContext(), { sessions: { orchestrator } });
    return createServerClient(handle.url, { headers: { Authorization: `Bearer ${token}` } });
  }

  afterEach(async () => {
    if (handle) await handle.close();
    handle = undefined;
  });

  it('launch: rejects a malformed repoId/wtId with 422 without invoking the handler', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const badRepo = await client.sessions.launch.$post({
      json: { repoId: '../evil', wtId: WT_ID },
    });
    expect(badRepo.status).toBe(422);
    const badWt = await client.sessions.launch.$post({ json: { repoId: REPO, wtId: 'no-hash' } });
    expect(badWt.status).toBe(422);
    expect(fake.calls.launch).toBe(0);
  });

  it('launch: starts a session and returns the launch (starting) status', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const res = await client.sessions.launch.$post({ json: { repoId: REPO, wtId: WT_ID } });
    expect(res.status).toBe(200);
    // The launch returns the SESSION launch status (transient `starting`), never `cloning`.
    expect(await res.json()).toMatchObject({ status: 'starting' });
    expect(fake.calls.launch).toBe(1);
  });

  it('stop: rejects a malformed request with 422; a valid stop reports stopped', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const bad = await client.sessions.stop.$post({ json: { repoId: REPO, wtId: 'no-hash' } });
    expect(bad.status).toBe(422);
    expect(fake.calls.stop).toBe(0);

    const ok = await client.sessions.stop.$post({ json: { repoId: REPO, wtId: WT_ID } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'stopped' });
    expect(fake.calls.stop).toBe(1);
  });

  it('list: rejects a malformed repo-id param with 422; a valid list returns existence + mapping', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    // `bad~owner` is routable but out of the repo-id charset → the refine fails → 422.
    const bad = await client.sessions[':owner'][':repo'].$get({
      param: { owner: 'bad~owner', repo: 'evil' },
    });
    expect(bad.status).toBe(422);
    expect(fake.calls.list).toBe(0);

    const ok = await client.sessions[':owner'][':repo'].$get({
      param: { owner: 'acme', repo: 'widget-factory' },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      repoId: REPO,
      sessions: [{ repoId: REPO, wtId: WT_ID, status: 'on' }],
    });
  });

  it('launch-status: rejects malformed input with 422; reports status, 404 when unknown', async () => {
    const fake = makeFake();
    const client = await boot(fake.orchestrator);
    const bad = await client.sessions[':owner'][':repo'][':wtId'].status.$get({
      param: { owner: 'acme', repo: 'widget-factory', wtId: 'no-hash' },
    });
    expect(bad.status).toBe(422);
    expect(fake.calls.status).toBe(0);

    const unknown = await client.sessions[':owner'][':repo'][':wtId'].status.$get({
      param: { owner: 'acme', repo: 'widget-factory', wtId: WT_ID },
    });
    expect(unknown.status).toBe(404);

    fake.statusResult = {
      repoId: `session/${REPO}/${WT_ID}`,
      operationId: 'op-1',
      status: 'ready',
    };
    const found = await client.sessions[':owner'][':repo'][':wtId'].status.$get({
      param: { owner: 'acme', repo: 'widget-factory', wtId: WT_ID },
    });
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ status: 'ready' });

    // A failed launch reports a typed SESSION error kind, not a clone `git-failure`.
    fake.statusResult = {
      repoId: `session/${REPO}/${WT_ID}`,
      operationId: 'op-1',
      status: 'error',
      error: { kind: 'tmux-failure' },
    };
    const failed = await client.sessions[':owner'][':repo'][':wtId'].status.$get({
      param: { owner: 'acme', repo: 'widget-factory', wtId: WT_ID },
    });
    expect(failed.status).toBe(200);
    expect(await failed.json()).toMatchObject({ status: 'error', error: { kind: 'tmux-failure' } });
  });
});
