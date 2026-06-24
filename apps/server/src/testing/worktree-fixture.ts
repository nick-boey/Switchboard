import { join } from 'node:path';
import type { RepoTarget, RuntimeContext } from '@switchboard/shared';
import { createTempGitRepo, type TempGitRepo } from '@switchboard/shared/testing';
import { createGitService, type GitService } from '../repos/git-service.js';
import { makeServerTestContext, type ServerTestContext } from './operation-scaffolding.js';

/**
 * Worktree test fixture (task 1.1). Extends the temp-git remote with a known existing branch and
 * bare-clones it into a temp `~/.switchboard` workspace **through the real Git service** (the same
 * `cloneBare` repo-clone-browse ships), so the worktree Git-service / orchestrator tests operate on
 * a genuine bare repo at `repos/<owner>/<repo>/.bare`. A small extension of the existing fixture,
 * not a new harness.
 */
export interface WorktreeFixture {
  remote: TempGitRepo;
  ctx: RuntimeContext;
  telemetry: ServerTestContext['telemetry'];
  gitService: GitService;
  target: RepoTarget;
  /** A branch that already exists on the (fixture) remote — drives the existing-remote-branch path. */
  existingBranch: string;
  /** Absolute path to the bare repo this fixture cloned. */
  bareDir: string;
  cleanup(): void;
}

export interface WorktreeFixtureOptions {
  target?: RepoTarget;
  existingBranch?: string;
  ctxOverrides?: Partial<RuntimeContext>;
}

/** Stand up a bare clone of a temp-git remote that carries a known existing branch. */
export async function createWorktreeFixture(
  options: WorktreeFixtureOptions = {},
): Promise<WorktreeFixture> {
  const target = options.target ?? { owner: 'acme', repo: 'widget-factory' };
  const existingBranch = options.existingBranch ?? 'existing-feature';

  const remote = createTempGitRepo();
  remote.seedBranch(existingBranch);

  const { ctx, telemetry } = makeServerTestContext(options.ctxOverrides);
  const gitService = createGitService(ctx);
  await gitService.cloneBare(target, { remoteUrl: remote.path });

  return {
    remote,
    ctx,
    telemetry,
    gitService,
    target,
    existingBranch,
    bareDir: gitService.bareDir(target),
    cleanup: () => remote.cleanup(),
  };
}

/** Absolute path to a worktree directory under the fixture's repo (test convenience). */
export function worktreesDir(ctx: RuntimeContext, target: RepoTarget): string {
  return join(ctx.workspaceRoot, 'repos', target.owner, target.repo, 'worktrees');
}
