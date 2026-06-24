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
 * Session launch-through-the-ledger tests (task 4.1, design Decision 2). A launch spawns the
 * detached session rooted at the worktree's path running `claude --remote-control`; duplicate /
 * concurrent launches collapse to a single session (idempotent); the launch op key is in a
 * namespace distinct from the worktree-create key; a launch subprocess failure resolves to a typed
 * error leaving no live session; and liveness is always re-derived from tmux (a settled op whose
 * session was killed externally reads off).
 */

const REPO = 'acme/widget-factory';
const WT_ID = 'feature-login--0123456789ab';

/** A minimal worktree view: every worktree exists by default; the path is the canonical layout. */
function fakeWorktreeView(over: Partial<SessionWorktreeView> = {}): SessionWorktreeView {
  return {
    worktreePath: (t: RepoTarget, wtId: string) =>
      `/ws/repos/${t.owner}/${t.repo}/worktrees/${wtId}`,
    isWorktreeComplete: async () => true,
    listWorktrees: async (): Promise<WorktreeSummary[]> => [],
    ...over,
  };
}

describe('session orchestrator — launch', () => {
  let ctx: ReturnType<typeof makeServerTestContext>['ctx'];
  let tmux: FakeTmuxRunner;

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

  it('launches a detached session rooted at the worktree path running claude --remote-control', async () => {
    const orch = make();
    const status = await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);

    const name = tmuxSessionName(REPO, WT_ID);
    expect(tmux.calls).toHaveLength(1);
    expect(tmux.calls[0]).toEqual({
      name,
      cwd: `/ws/repos/acme/widget-factory/worktrees/${WT_ID}`,
      command: ['claude', '--remote-control'],
    });
    expect(await tmux.hasSession(name)).toBe(true);
    expect(status.status === 'cloning' || status.status === 'ready').toBe(true);
    expect((await orch.getLaunchStatus(REPO, WT_ID))?.status).toBe('ready');
  });

  it('collapses concurrent duplicate launches to a single session (idempotent)', async () => {
    const orch = make();
    const [a, b] = await Promise.all([
      orch.launchSession(REPO, WT_ID),
      orch.launchSession(REPO, WT_ID),
    ]);
    await orch.whenSettled(REPO, WT_ID);
    expect(a.operationId).toBe(b.operationId);
    expect(tmux.calls).toHaveLength(1);
  });

  it('keys the launch op in a namespace distinct from the worktree-create key', async () => {
    const orch = make();
    const status = await orch.launchSession(REPO, WT_ID);
    // The op key (carried as `repoId`) is the `session/...` namespace, never the bare worktree key.
    expect(status.repoId).toBe(`session/${REPO}/${WT_ID}`);
    expect(status.repoId).not.toBe(`${REPO}/${WT_ID}`);
  });

  it('resolves a launch subprocess failure to a typed error leaving no live session', async () => {
    const failing: TmuxRunner = {
      ...tmux,
      newSession: async () => {
        throw new Error('tmux missing');
      },
    };
    const orch = make({ tmuxRunner: failing });
    await orch.launchSession(REPO, WT_ID);
    const settled = await orch.whenSettled(REPO, WT_ID);
    expect(settled?.status).toBe('error');
    expect(await tmux.hasSession(tmuxSessionName(REPO, WT_ID))).toBe(false);
  });

  it('refuses to launch for a worktree that does not exist (typed error, no session)', async () => {
    const orch = make({
      worktreeService: fakeWorktreeView({ isWorktreeComplete: async () => false }),
    });
    await orch.launchSession(REPO, WT_ID);
    const settled = await orch.whenSettled(REPO, WT_ID);
    expect(settled?.status).toBe('error');
    expect(tmux.calls).toHaveLength(0);
  });

  it('re-derives liveness from tmux: a settled op whose session was killed externally reads off', async () => {
    const orch = make();
    await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    const name = tmuxSessionName(REPO, WT_ID);
    expect(await tmux.hasSession(name)).toBe(true);

    // Killed outside Switchboard — the ledger record stays succeeded, but tmux truth is off.
    tmux.setSession(name, false);
    expect((await orch.getLaunchStatus(REPO, WT_ID))?.status).toBe('ready'); // stale settled record
    expect(await tmux.hasSession(name)).toBe(false); // liveness re-derived from tmux
  });

  it('relaunch after an external kill does NOT reuse the stale succeeded record — it creates a new session', async () => {
    const orch = make();
    const first = await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    const name = tmuxSessionName(REPO, WT_ID);
    expect(tmux.calls).toHaveLength(1);

    // The session is killed outside Switchboard: the `succeeded` record is now STALE.
    tmux.setSession(name, false);

    // Activating the plug again must re-check the tmux marker (absent) and start a FRESH op that
    // creates a NEW detached session — never no-op on the stale record.
    const second = await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    expect(second.operationId).not.toBe(first.operationId);
    expect(tmux.calls).toHaveLength(2);
    expect(await tmux.hasSession(name)).toBe(true);
  });
});
