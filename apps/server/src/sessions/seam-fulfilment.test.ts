import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idForBranch, toRepoId, tmuxSessionName } from '@switchboard/shared';
import { createWorktreeFixture, type WorktreeFixture } from '../testing/worktree-fixture.js';
import { fakeTmuxRunner, type FakeTmuxRunner } from '../testing/tmux-runner.js';
import { fakePrStatusProbe } from '../testing/worktree-seams.js';
import { createWorktreeService } from '../worktrees/git-worktree.js';
import {
  createWorktreeOrchestrator,
  type WorktreeOrchestrator,
} from '../worktrees/orchestrator.js';
import { WorktreeNotSafeError } from '../worktrees/errors.js';
import { createSessionProbe } from './session-probe.js';

/**
 * Cross-change seam fulfilment (task 6.1, design Decision 4 / worktree-management Decision 6). The
 * tmux-backed `SessionProbe` this change provides fills worktree-management's
 * `hasActiveSession(repoId, wtId)` seam: with the real probe injected, a worktree whose tmux session
 * is live is reported active, so the safe-to-delete predicate treats it as NOT idle and a non-force
 * delete is refused. To isolate the session term (the PR-merged term has no MVP source and would
 * otherwise keep every worktree not-safe), the test injects `prMerged = true`, so only a live
 * session can keep the worktree not-safe.
 */
describe('SessionProbe fulfils the worktree safe-to-delete seam', () => {
  let fx: WorktreeFixture;
  let tmux: FakeTmuxRunner;

  beforeEach(async () => {
    fx = await createWorktreeFixture();
    tmux = fakeTmuxRunner();
  });
  afterEach(() => fx.cleanup());

  function makeOrchestrator(): {
    orch: WorktreeOrchestrator;
    prStatusProbe: ReturnType<typeof fakePrStatusProbe>;
  } {
    const worktreeService = createWorktreeService(fx.ctx, { gitService: fx.gitService });
    const sessionProbe = createSessionProbe(tmux);
    const prStatusProbe = fakePrStatusProbe();
    const orch = createWorktreeOrchestrator(fx.ctx, {
      worktreeService,
      sessionProbe,
      prStatusProbe,
    });
    return { orch, prStatusProbe };
  }

  async function create(
    orch: WorktreeOrchestrator,
    branch: string,
  ): Promise<{ repoId: string; wtId: string }> {
    const repoId = toRepoId(fx.target);
    const wtId = idForBranch(branch);
    await orch.startCreate({ target: fx.target, branch, mode: 'new' });
    await orch.whenSettled(repoId, wtId);
    return { repoId, wtId };
  }

  it('a live session keeps the worktree not idle → non-force delete refused; killing it allows delete', async () => {
    const { orch, prStatusProbe } = makeOrchestrator();
    const { repoId, wtId } = await create(orch, 'feature/guard-by-session');
    // Isolate the session term: pretend the PR is merged so ONLY a live session can keep it not-safe.
    prStatusProbe.setMerged(repoId, wtId, true);

    const name = tmuxSessionName(repoId, wtId);
    tmux.setSession(name, true);
    await expect(orch.deleteWorktree(fx.target, wtId)).rejects.toBeInstanceOf(WorktreeNotSafeError);

    // Killed → no active session → the idle term passes → the non-force delete proceeds.
    tmux.setSession(name, false);
    await expect(orch.deleteWorktree(fx.target, wtId)).resolves.toBeUndefined();
  });

  it('a worktree with no session reports no active session (degrade-safe seam value)', async () => {
    const probe = createSessionProbe(tmux);
    expect(await probe.hasActiveSession(toRepoId(fx.target), idForBranch('no-session'))).toBe(
      false,
    );
  });
});
