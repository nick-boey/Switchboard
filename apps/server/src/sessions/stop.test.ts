import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { tmuxSessionName, type RepoTarget, type WorktreeSummary } from '@switchboard/shared';
import { makeServerTestContext } from '../testing/operation-scaffolding.js';
import { fakeTmuxRunner, type FakeTmuxRunner } from '../testing/tmux-runner.js';
import type { TmuxRunner } from './tmux-runner.js';
import {
  createSessionOrchestrator,
  type SessionOrchestrator,
  type SessionWorktreeView,
} from './orchestrator.js';

/**
 * Stop / teardown + lifecycle serialization tests (tasks 7.1 + 7.3, design Decision 6). Stop kills
 * the tmux session (not ledgered — tmux truth is authoritative), is idempotent, and never touches
 * the worktree or branch. Launch + stop serialize on the per-session boundary via the drain-then-
 * lock loop WITHOUT deadlocking: a stop drains an in-flight launch with the lock RELEASED (so the
 * worker can reacquire the lock to settle), then kills under the lock, re-draining any launch that
 * registers between the drain and the lock. The final state for a launch racing a stop is `off`.
 */

const REPO = 'acme/widget-factory';
const WT_ID = 'feature-login--0123456789ab';
const REPO_TARGET: RepoTarget = { owner: 'acme', repo: 'widget-factory' };

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeWorktreeView(over: Partial<SessionWorktreeView> = {}): SessionWorktreeView {
  return {
    worktreePath: (t: RepoTarget, wtId: string) =>
      `/ws/repos/${t.owner}/${t.repo}/worktrees/${wtId}`,
    isWorktreeComplete: async () => true,
    listWorktrees: async (): Promise<WorktreeSummary[]> => [],
    ...over,
  };
}

describe('session orchestrator — stop / teardown', () => {
  let ctx: ReturnType<typeof makeServerTestContext>['ctx'];
  let tmux: FakeTmuxRunner;
  const name = tmuxSessionName(REPO, WT_ID);

  beforeEach(() => {
    ({ ctx } = makeServerTestContext());
    tmux = fakeTmuxRunner();
  });
  afterEach(() => {
    rmSync(ctx.workspaceRoot, { recursive: true, force: true });
  });

  const make = (deps: Partial<Parameters<typeof createSessionOrchestrator>[1]> = {}) =>
    createSessionOrchestrator(ctx, {
      worktreeService: fakeWorktreeView(),
      tmuxRunner: tmux,
      ...deps,
    });

  it('stopping a live session kills it and liveness flips to off', async () => {
    const orch = make();
    await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    expect(await tmux.hasSession(name)).toBe(true);

    await orch.stopSession(REPO, WT_ID);
    expect(await tmux.hasSession(name)).toBe(false);
  });

  it('stopping an absent session is an idempotent no-op success', async () => {
    const orch = make();
    await expect(orch.stopSession(REPO, WT_ID)).resolves.toBeUndefined();
    // A second stop is equally a no-op.
    await expect(orch.stopSession(REPO, WT_ID)).resolves.toBeUndefined();
    expect(await tmux.hasSession(name)).toBe(false);
  });

  it('stop never touches the worktree or branch (only tmux kill-session)', async () => {
    let listed = 0;
    let completeChecks = 0;
    const orch = make({
      worktreeService: fakeWorktreeView({
        listWorktrees: async () => {
          listed += 1;
          return [];
        },
        isWorktreeComplete: async () => {
          completeChecks += 1;
          return true;
        },
      }),
    });
    tmux.setSession(name, true);
    await orch.stopSession(REPO, WT_ID);
    // Stop kills the session and does not enumerate or mutate worktrees.
    expect(await tmux.hasSession(name)).toBe(false);
    expect(listed).toBe(0);
    expect(completeChecks).toBe(0);
  });

  it('a force-deleted worktree’s live session is not auto-killed and not surfaced by listing', async () => {
    // The worktree has left the existing set, but its tmux session is still live (orphan).
    const orch = make({ worktreeService: fakeWorktreeView({ listWorktrees: async () => [] }) });
    tmux.setSession(name, true);
    // Listing never surfaces the orphan (existing worktrees only)...
    expect(await orch.listSessions(REPO_TARGET)).toEqual([]);
    // ...and nothing auto-killed it (manual cleanup is the known limitation).
    expect(await tmux.hasSession(name)).toBe(true);
  });
});

describe('session lifecycle serialization (launch vs stop, no deadlock)', () => {
  let ctx: ReturnType<typeof makeServerTestContext>['ctx'];
  let tmux: FakeTmuxRunner;
  const name = tmuxSessionName(REPO, WT_ID);

  beforeEach(() => {
    ({ ctx } = makeServerTestContext());
    tmux = fakeTmuxRunner();
  });
  afterEach(() => {
    rmSync(ctx.workspaceRoot, { recursive: true, force: true });
  });

  const make = (tmuxRunner: TmuxRunner = tmux): SessionOrchestrator =>
    createSessionOrchestrator(ctx, { worktreeService: fakeWorktreeView(), tmuxRunner });

  it('a launch racing a stop ends off: launch settles succeeded, the one session is killed', async () => {
    const orch = make();
    // launch() first → its ledger.start registers before stop's kill; the loop drains it then kills.
    await Promise.all([orch.launchSession(REPO, WT_ID), orch.stopSession(REPO, WT_ID)]);
    await orch.whenSettled(REPO, WT_ID);
    expect((await orch.getLaunchStatus(REPO, WT_ID))?.status).toBe('ready');
    expect(tmux.calls).toHaveLength(1); // exactly one session created...
    expect(await tmux.hasSession(name)).toBe(false); // ...then killed → off
  });

  it('a launch registering between the stop’s drain and lock is still drained-and-killed', async () => {
    const orch = make();
    // stop() first: its first drain finds nothing in-flight, but the launch's start registers
    // before stop takes the kill lock — the loop's in-flight re-check re-drains and kills it.
    const stopP = orch.stopSession(REPO, WT_ID);
    const launchP = orch.launchSession(REPO, WT_ID);
    await Promise.all([stopP, launchP]);
    await orch.whenSettled(REPO, WT_ID);
    expect((await orch.getLaunchStatus(REPO, WT_ID))?.status).toBe('ready');
    expect(tmux.calls).toHaveLength(1);
    expect(await tmux.hasSession(name)).toBe(false);
  });

  it('a stop racing duplicate launches collapses to one session, then kills it (final off)', async () => {
    const orch = make();
    const [a, b] = await Promise.all([
      orch.launchSession(REPO, WT_ID),
      orch.launchSession(REPO, WT_ID),
      orch.stopSession(REPO, WT_ID),
    ]);
    await orch.whenSettled(REPO, WT_ID);
    expect(a.operationId).toBe(b.operationId); // idempotent: one launch op
    expect(tmux.calls).toHaveLength(1); // one session created
    expect(await tmux.hasSession(name)).toBe(false); // and killed → off
  });

  it('deadlock regression: a stop draining an in-flight launch (session spawned, terminal write pending) does not hang and ends off', async () => {
    const gate = deferred<void>();
    // The launch worker spawns the tmux session, then BLOCKS before returning — so its terminal
    // ledger write (which reacquires the per-session lock) is still pending when the stop starts.
    const gated: TmuxRunner = {
      newSession: async (n, c, cmd) => {
        await tmux.newSession(n, c, cmd); // marks the session live (spawned)
        await gate.promise; // hold before returning → terminal transition pending
      },
      hasSession: (n) => tmux.hasSession(n),
      listSessions: () => tmux.listSessions(),
      killSession: (n) => tmux.killSession(n),
    };
    const orch = make(gated);

    const launchP = orch.launchSession(REPO, WT_ID);
    await launchP; // returns the in-flight (starting) status
    await tick(); // let the worker reach newSession + mark the session live
    expect(await tmux.hasSession(name)).toBe(true);

    // Stop drains the in-flight launch with the per-session lock RELEASED — it must NOT hang.
    const stopP = orch.stopSession(REPO, WT_ID);
    await tick();
    gate.resolve(); // the worker can now reacquire the lock and settle

    await expect(stopP).resolves.toBeUndefined(); // no deadlock
    await orch.whenSettled(REPO, WT_ID);
    expect((await orch.getLaunchStatus(REPO, WT_ID))?.status).toBe('ready'); // settled succeeded
    expect(await tmux.hasSession(name)).toBe(false); // killed → off
  });
});
