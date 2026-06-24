import { beforeEach, describe, expect, it } from 'vitest';
import type { RepoTarget, WorktreeSummary } from '@switchboard/shared';
import { makeServerTestContext } from '../testing/operation-scaffolding.js';
import {
  fakePrStatusProbe,
  fakeSessionProbe,
  type FakePrStatusProbe,
  type FakeSessionProbe,
} from '../testing/worktree-seams.js';
import { WorktreeNotSafeError } from './errors.js';
import { safeToDelete } from './safe-to-delete.js';
import { createWorktreeOrchestrator, type WorktreeOrchestrator } from './orchestrator.js';
import type { WorktreeService } from './git-worktree.js';

/**
 * Failing-first tests for the safe-to-delete gate (task 5.1) with the group-1.2 seam fakes. The
 * predicate is `noActiveSession AND prMerged AND NOT dirty`; the server-side guard refuses an
 * unsafe delete (typed `not-safe`) unless `force` is supplied. The MVP coherence assertions:
 * with no `prMerged` source wired, no worktree is ever auto-safe (the auto-safe path is dormant),
 * a worktree with no merged PR is not auto-safe, and every MVP deletion is confirmation-gated via
 * `force`.
 */

const target: RepoTarget = { owner: 'acme', repo: 'infra' };
const wtId = 'feature-x--0123456789ab';

describe('safeToDelete predicate', () => {
  it('is true only when idle, PR-merged, and clean', () => {
    expect(safeToDelete({ dirty: false, hasActiveSession: false, prMerged: true })).toBe(true);
    expect(safeToDelete({ dirty: true, hasActiveSession: false, prMerged: true })).toBe(false);
    expect(safeToDelete({ dirty: false, hasActiveSession: true, prMerged: true })).toBe(false);
    expect(safeToDelete({ dirty: false, hasActiveSession: false, prMerged: false })).toBe(false);
  });
});

describe('worktree delete guard (server-side re-check)', () => {
  let removed: string[];
  let summary: WorktreeSummary;
  let session: FakeSessionProbe;
  let pr: FakePrStatusProbe;
  let service: WorktreeService;

  beforeEach(() => {
    removed = [];
    summary = {
      wtId,
      branch: 'feature/x',
      path: `repos/acme/infra/worktrees/${wtId}`,
      dirty: false,
      sync: 'up-to-date',
    };
    session = fakeSessionProbe();
    pr = fakePrStatusProbe();
    service = {
      worktreePath: (_t, id) => `/fake/${id}`,
      createWorktree: async () => ({ wtId }),
      listWorktrees: async () => [summary],
      removeWorktree: async (_t, id) => {
        removed.push(id);
      },
      removeWorktreeIfIncomplete: async () => {},
      isWorktreeComplete: async () => true,
    };
  });

  function orchestrator(): WorktreeOrchestrator {
    const { ctx } = makeServerTestContext();
    return createWorktreeOrchestrator(ctx, {
      worktreeService: service,
      sessionProbe: session,
      prStatusProbe: pr,
    });
  }

  it('refuses an unsafe (not-merged, MVP default) delete without force', async () => {
    // Clean + idle, but the merged-PR input has no MVP source → not auto-safe → refused.
    await expect(orchestrator().deleteWorktree(target, wtId)).rejects.toBeInstanceOf(
      WorktreeNotSafeError,
    );
    expect(removed).toEqual([]);
  });

  it('refuses a dirty worktree without force', async () => {
    summary.dirty = true;
    pr.setMerged('acme/infra', wtId, true);
    await expect(orchestrator().deleteWorktree(target, wtId)).rejects.toBeInstanceOf(
      WorktreeNotSafeError,
    );
    expect(removed).toEqual([]);
  });

  it('refuses a session-active worktree without force', async () => {
    pr.setMerged('acme/infra', wtId, true);
    session.setActiveSession('acme/infra', wtId, true);
    await expect(orchestrator().deleteWorktree(target, wtId)).rejects.toBeInstanceOf(
      WorktreeNotSafeError,
    );
    expect(removed).toEqual([]);
  });

  it('allows any unsafe delete with force (the MVP confirmation path)', async () => {
    summary.dirty = true;
    await orchestrator().deleteWorktree(target, wtId, { force: true });
    expect(removed).toEqual([wtId]);
  });

  it('auto-deletes when the predicate is fully satisfied (dormant until a PR source wires prMerged)', async () => {
    // Once a PR-status source sets prMerged, a clean/idle worktree becomes auto-safe (non-force).
    pr.setMerged('acme/infra', wtId, true);
    await orchestrator().deleteWorktree(target, wtId);
    expect(removed).toEqual([wtId]);
  });

  it('MVP coherence: with no PR source, even a clean idle worktree needs confirmation', async () => {
    // The seams degrade safely (no session, PR unmerged) so no worktree is ever auto-safe.
    await expect(orchestrator().deleteWorktree(target, wtId)).rejects.toBeInstanceOf(
      WorktreeNotSafeError,
    );
    // ...but it stays fully deletable via the confirmation/force path.
    await orchestrator().deleteWorktree(target, wtId, { force: true });
    expect(removed).toEqual([wtId]);
  });
});
