import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RepoTarget } from '@switchboard/shared';
import {
  fakeClock,
  fakeProcessProbe,
  makeServerTestContext,
  type FakeProcessProbe,
} from '../testing/operation-scaffolding.js';
import { createCloneOrchestrator, type CloneOrchestrator } from './clone.js';
import { GitCloneError } from './git-runner.js';
import type { GitService } from './git-service.js';

/**
 * Failing-first tests for the clone-through-ledger orchestration (task 6.1). A controllable fake
 * Git service drives the cases deterministically: start→cloning→ready, idempotency, serialization,
 * abort + cleanup, the abort-races-completion single terminal transition (both winners), restart
 * reconcile, and typed failure mapping. (Real git integration is proven in group 5 + the E2E.)
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const key = (t: RepoTarget): string => `${t.owner}/${t.repo}`;

interface FakeGit {
  service: GitService;
  completed: Set<string>;
  cleaned: string[];
  runs: number;
  pending: Deferred<void> | null;
  failWith: Error | null;
}

function makeFakeGit(): FakeGit {
  const state: FakeGit = {
    completed: new Set(),
    cleaned: [],
    runs: 0,
    pending: null,
    failWith: null,
    service: undefined as unknown as GitService,
  };
  state.service = {
    bareDir: (t) => `/fake/${key(t)}/.bare`,
    isComplete: (t) => state.completed.has(key(t)),
    isCloned: (t) => state.completed.has(key(t)),
    async listCloned() {
      return [...state.completed].map((id) => {
        const [owner, repo] = id.split('/');
        return { owner, repo };
      });
    },
    removeIfIncomplete: (t) => {
      if (!state.completed.has(key(t))) state.cleaned.push(key(t));
    },
    cloneBare: (t, options) => {
      state.runs += 1;
      const d = deferred<void>();
      state.pending = d;
      options?.onSpawn?.(9000 + state.runs);
      options?.signal?.addEventListener('abort', () => d.reject(new Error('killed')));
      if (state.failWith) {
        const err = state.failWith;
        queueMicrotask(() => d.reject(err));
      }
      return d.promise.then(() => {
        state.completed.add(key(t));
      });
    },
  };
  return state;
}

describe('clone orchestration (repo-clone)', () => {
  let fake: FakeGit;
  let probe: FakeProcessProbe;
  let workspaceRoot: string;

  beforeEach(() => {
    fake = makeFakeGit();
    probe = fakeProcessProbe();
    const { ctx } = makeServerTestContext();
    workspaceRoot = ctx.workspaceRoot;
  });
  afterEach(() => {
    fake.pending?.resolve();
  });

  function orchestrator(): CloneOrchestrator {
    const { ctx } = makeServerTestContext({ workspaceRoot });
    return createCloneOrchestrator(ctx, {
      gitService: fake.service,
      clock: fakeClock(1000),
      processProbe: probe,
    });
  }

  const target: RepoTarget = { owner: 'acme', repo: 'infra' };

  it('starts as a tracked op (cloning) and reaches ready on success', async () => {
    const orch = orchestrator();
    const started = await orch.startClone(target);
    expect(started).toMatchObject({ repoId: 'acme/infra', status: 'cloning' });
    expect(typeof started.operationId).toBe('string');

    fake.pending?.resolve();
    const settled = await orch.whenSettled('acme/infra');
    expect(settled?.status).toBe('ready');
    expect(await orch.listCloned()).toContainEqual(target);
  });

  it('is idempotent for an in-flight or already-cloned repo', async () => {
    const orch = orchestrator();
    const first = await orch.startClone(target);
    const dup = await orch.startClone(target);
    expect(dup.operationId).toBe(first.operationId);
    expect(fake.runs).toBe(1);

    fake.pending?.resolve();
    await orch.whenSettled('acme/infra');
    const afterDone = await orch.startClone(target);
    expect(afterDone.status).toBe('ready');
    expect(fake.runs).toBe(1);
  });

  it('serializes concurrent same-repo clones to one operation', async () => {
    const orch = orchestrator();
    const [a, b] = await Promise.all([orch.startClone(target), orch.startClone(target)]);
    expect(a.operationId).toBe(b.operationId);
    expect(fake.runs).toBe(1);
    fake.pending?.resolve();
    await orch.whenSettled('acme/infra');
  });

  it('abort cancels the subprocess and removes the partial .bare', async () => {
    const orch = orchestrator();
    await orch.startClone(target);
    const aborted = await orch.abortClone('acme/infra');
    expect(aborted?.status).toBe('aborted');
    expect(fake.cleaned).toEqual(['acme/infra']);
    await orch.whenSettled('acme/infra');
  });

  it('abort racing completion: completion wins → ready, .bare not deleted', async () => {
    const orch = orchestrator();
    await orch.startClone(target);
    // The subprocess wrote its marker before finalization ran.
    fake.completed.add('acme/infra');
    const result = await orch.abortClone('acme/infra');
    expect(result?.status).toBe('ready');
    expect(fake.cleaned).toEqual([]);
    fake.pending?.resolve();
    await orch.whenSettled('acme/infra');
  });

  it('reconciles a running clone with a dead process on restart', async () => {
    const orch1 = orchestrator();
    await orch1.startClone(target);
    await new Promise((r) => setTimeout(r, 0)); // let setPid persist

    probe.kill(9001);
    const orch2 = orchestrator();
    await orch2.reconcile();
    const status = await orch2.getStatus('acme/infra');
    expect(status?.status).toBe('error');
    expect(fake.cleaned).toContain('acme/infra');
    fake.pending?.resolve();
  });

  it('records a typed error when the clone fails', async () => {
    fake.failWith = new GitCloneError('not-found', 1);
    const orch = orchestrator();
    await orch.startClone(target);
    const settled = await orch.whenSettled('acme/infra');
    expect(settled?.status).toBe('error');
    expect(settled?.error?.kind).toBe('not-found');
  });

  it('maps an unclassified git failure to git-failure', async () => {
    fake.failWith = new Error('boom');
    const orch = orchestrator();
    await orch.startClone(target);
    const settled = await orch.whenSettled('acme/infra');
    expect(settled?.status).toBe('error');
    expect(settled?.error?.kind).toBe('git-failure');
  });
});
