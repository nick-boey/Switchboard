import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RepoTarget } from '@switchboard/shared';
import {
  fakeClock,
  fakeProcessProbe,
  makeServerTestContext,
  type FakeProcessProbe,
} from '../testing/operation-scaffolding.js';
import { WorktreeCollisionError } from './errors.js';
import { createWorktreeOrchestrator, type WorktreeOrchestrator } from './orchestrator.js';
import type { WorktreeCreateInput, WorktreeCreateResult, WorktreeService } from './git-worktree.js';

/**
 * Failing-first tests for the worktree orchestrator (task 4.1), using the operation scaffolding +
 * a controllable fake worktree service: a create is a tracked `worktree` op keyed `<repo-id>/
 * <wt-id>` reaching ready; the op records the exact branch and a same-key/same-branch duplicate is
 * idempotent while a same-key/**different**-branch request raises the typed collision error at the
 * operation boundary (no second worktree); concurrent creates of different worktrees serialize
 * their git mutations under the per-repo lock; abort cleans a partial (completion-wins keeps a
 * completed one); a stale `running` op reconciles to failed + cleanup on restart.
 */

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: unknown) => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  return { promise, resolve, reject };
}

const target: RepoTarget = { owner: 'acme', repo: 'infra' };

interface FakeWt {
  service: WorktreeService;
  completed: Set<string>;
  cleaned: string[];
  runs: number;
  maxConcurrent: number;
  pending: Map<string, Deferred>;
}

/** A fake worktree service whose createWorktree blocks on a per-wtId deferred. */
function makeFakeWt(idForBranch: (b: string) => string): FakeWt {
  let active = 0;
  const state: FakeWt = {
    completed: new Set(),
    cleaned: [],
    runs: 0,
    maxConcurrent: 0,
    pending: new Map(),
    service: undefined as unknown as WorktreeService,
  };
  state.service = {
    worktreePath: (_t, wtId) => `/fake/${wtId}`,
    async createWorktree(input: WorktreeCreateInput, options): Promise<WorktreeCreateResult> {
      const wtId = idForBranch(input.branch);
      state.runs += 1;
      active += 1;
      state.maxConcurrent = Math.max(state.maxConcurrent, active);
      const d = deferred();
      state.pending.set(wtId, d);
      options?.onSpawn?.(9000 + state.runs);
      options?.signal?.addEventListener('abort', () => d.reject(new Error('killed')));
      try {
        await d.promise;
        state.completed.add(wtId);
        return { wtId };
      } finally {
        active -= 1;
      }
    },
    async listWorktrees() {
      return [];
    },
    async removeWorktree(_t, wtId) {
      state.completed.delete(wtId);
    },
    async removeWorktreeIfIncomplete(_t, wtId) {
      if (!state.completed.has(wtId)) state.cleaned.push(wtId);
    },
    async isWorktreeComplete(_t, wtId) {
      return state.completed.has(wtId);
    },
  };
  return state;
}

describe('worktree orchestrator (ledger + per-repo lock)', () => {
  let fake: FakeWt;
  let probe: FakeProcessProbe;
  let workspaceRoot: string;
  // Default id derivation: 1:1 from branch (overridden to force a collision).
  let idForBranch: (b: string) => string;

  beforeEach(() => {
    // Slash-free, like the real path-safe id derivation (so `<repo-id>/<wt-id>` keys parse).
    idForBranch = (b) => `wt-${b.replace(/[^a-z0-9]+/gi, '-')}--00000000abcd`;
    fake = makeFakeWt(idForBranch);
    probe = fakeProcessProbe();
    workspaceRoot = makeServerTestContext().ctx.workspaceRoot;
  });
  afterEach(() => {
    for (const d of fake.pending.values()) d.resolve();
  });

  function orchestrator(idFn = idForBranch): WorktreeOrchestrator {
    const { ctx } = makeServerTestContext({ workspaceRoot });
    return createWorktreeOrchestrator(ctx, {
      worktreeService: fake.service,
      idForBranch: idFn,
      clock: fakeClock(1000),
      processProbe: probe,
    });
  }

  const create = (
    branch: string,
    mode: WorktreeCreateInput['mode'] = 'new',
  ): WorktreeCreateInput => ({
    target,
    branch,
    mode,
  });

  it('starts as a tracked worktree op and reaches ready', async () => {
    const orch = orchestrator();
    const wtId = idForBranch('feature/x');
    const started = await orch.startCreate(create('feature/x'));
    expect(started.status).toBe('cloning'); // generic in-progress (reused operation status)
    expect(typeof started.operationId).toBe('string');

    fake.pending.get(wtId)?.resolve();
    const settled = await orch.whenSettled('acme/infra', wtId);
    expect(settled?.status).toBe('ready');
    expect(fake.completed.has(wtId)).toBe(true);
  });

  it('is idempotent for a duplicate create with the same key and same branch', async () => {
    const orch = orchestrator();
    const first = await orch.startCreate(create('feature/x'));
    const dup = await orch.startCreate(create('feature/x'));
    expect(dup.operationId).toBe(first.operationId);
    expect(fake.runs).toBe(1);
  });

  it('rejects a same-key/different-branch collision at the operation boundary (no second worktree)', async () => {
    // A stubbed idForBranch maps two DISTINCT branches to one wt-id → forced truncated-hash collision.
    const collidingId = (): string => 'collide--00000000abcd';
    const orch = orchestrator(collidingId);
    await orch.startCreate(create('branch-one'));
    await expect(orch.startCreate(create('branch-two'))).rejects.toBeInstanceOf(
      WorktreeCollisionError,
    );
    // Only the first worktree's create ever ran — the request was not aliased onto it.
    expect(fake.runs).toBe(1);
  });

  it('runs independent ops for different worktrees but serializes their git mutations', async () => {
    const orch = orchestrator();
    const idA = idForBranch('feature/a');
    const idB = idForBranch('feature/b');
    const [a, b] = await Promise.all([
      orch.startCreate(create('feature/a')),
      orch.startCreate(create('feature/b')),
    ]);
    expect(a.operationId).not.toBe(b.operationId); // independent operations
    // The per-repo lock means only one createWorktree is in flight at a time.
    expect(fake.maxConcurrent).toBe(1);
    expect(fake.runs).toBe(1); // the second waits on the lock until the first resolves

    fake.pending.get(idA)?.resolve();
    await orch.whenSettled('acme/infra', idA);
    // Now the second proceeds.
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.runs).toBe(2);
    fake.pending.get(idB)?.resolve();
    await orch.whenSettled('acme/infra', idB);
    expect(fake.completed.size).toBe(2);
  });

  it('abort cancels and cleans a partial worktree', async () => {
    const orch = orchestrator();
    const wtId = idForBranch('feature/x');
    await orch.startCreate(create('feature/x'));
    const aborted = await orch.abortCreate('acme/infra', wtId);
    expect(aborted?.status).toBe('aborted');
    expect(fake.cleaned).toContain(wtId);
    await orch.whenSettled('acme/infra', wtId);
  });

  it('abort racing completion: completion wins → ready, not cleaned', async () => {
    const orch = orchestrator();
    const wtId = idForBranch('feature/x');
    await orch.startCreate(create('feature/x'));
    // The worker wrote its marker before finalization ran.
    fake.completed.add(wtId);
    const result = await orch.abortCreate('acme/infra', wtId);
    expect(result?.status).toBe('ready');
    expect(fake.cleaned).not.toContain(wtId);
    fake.pending.get(wtId)?.resolve();
    await orch.whenSettled('acme/infra', wtId);
  });

  it('does NOT destructively clean up an in-flight worktree op that has no recorded pid', async () => {
    // Restart-recovery hazard: the server crashed after `git worktree add` was spawned but BEFORE
    // the async pid persist landed, so the durable record is `running` with `pid === undefined`.
    // The old git child may still be mutating the bare repo / worktree admin state, so reconcile
    // must mark the op failed/needs-attention but MUST NOT delete around the possibly-live child.
    const orch = orchestrator(); // constructs the ledger (creates the operations dir)
    const wtId = idForBranch('feature/x');
    const key = `acme/infra/${wtId}`;
    writeFileSync(
      join(workspaceRoot, 'operations', `${encodeURIComponent(key)}.json`),
      JSON.stringify({
        id: 'inflight-1',
        type: 'worktree',
        key,
        state: 'running',
        startedAt: 1000,
      }),
    );

    await orch.reconcile();

    // The op is unstuck (no longer `running`) ...
    expect((await orch.getStatus('acme/infra', wtId))?.status).toBe('error');
    // ... but NO destructive cleanup ran against the possibly-live mutation.
    expect(fake.cleaned).not.toContain(wtId);
  });

  it('reconciles a stale running worktree op with a dead process on restart', async () => {
    const orch1 = orchestrator();
    const wtId = idForBranch('feature/x');
    await orch1.startCreate(create('feature/x'));
    await new Promise((r) => setTimeout(r, 0)); // let setPid persist

    probe.kill(9001);
    const orch2 = orchestrator();
    await orch2.reconcile();
    const status = await orch2.getStatus('acme/infra', wtId);
    expect(status?.status).toBe('error');
    expect(fake.cleaned).toContain(wtId);
    fake.pending.get(wtId)?.resolve();
  });
});
