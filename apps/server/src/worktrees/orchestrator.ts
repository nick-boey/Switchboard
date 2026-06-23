import { join } from 'node:path';
import {
  idForBranch as defaultIdForBranch,
  toRepoId,
  type OperationStatus,
  type RepoTarget,
  type RuntimeContext,
  type WorktreeSummary,
} from '@switchboard/shared';
import {
  createKeyedLock,
  createOperationLedger,
  type Clock,
  type KeyedLock,
  type OperationLedger,
  type OperationRecord,
  type ProcessProbe,
} from '../operations/index.js';
import type { GitRunner } from '../repos/git-runner.js';
import { WorktreeCollisionError } from './errors.js';
import {
  createWorktreeService,
  type WorktreeCreateInput,
  type WorktreeService,
} from './git-worktree.js';

/**
 * Worktree-creation-through-ledger orchestration (design Decision 3 + worktree-management
 * Decision 3). A create runs as a tracked `worktree` operation keyed `<repo-id>/<wt-id>` so the
 * route returns immediately and the UI polls. Two locks, finest correct granularity:
 *
 * - the ledger's **per-operation-key** lock (`<repo-id>/<wt-id>`) gives idempotency + a single
 *   terminal transition per worktree;
 * - a **per-`<repo-id>`** `KeyedLock` serializes the git-mutating critical section
 *   (`worktree add`/`remove`/`prune`), which mutates the shared bare repo's admin state.
 *
 * The operation records the **exact requested branch** in its metadata; idempotent reuse checks
 * branch equality FIRST, so a same-key/different-branch truncated-hash collision raises the typed
 * `WorktreeCollisionError` at this boundary rather than aliasing the existing operation.
 */

export interface WorktreeOrchestrator {
  startCreate(input: WorktreeCreateInput): Promise<OperationStatus>;
  abortCreate(repoId: string, wtId: string): Promise<OperationStatus | null>;
  getStatus(repoId: string, wtId: string): Promise<OperationStatus | null>;
  listWorktrees(target: RepoTarget): Promise<WorktreeSummary[]>;
  /** Remove a worktree under the per-repo git-mutation lock (the guard lives in the route). */
  removeWorktree(target: RepoTarget, wtId: string): Promise<void>;
  reconcile(): Promise<void>;
  whenSettled(repoId: string, wtId: string): Promise<OperationStatus | null>;
}

export interface WorktreeOrchestratorDeps {
  worktreeService?: WorktreeService;
  runner?: GitRunner;
  clock?: Clock;
  processProbe?: ProcessProbe;
  /** Per-`<repo-id>` git-mutation lock (injectable for tests; defaults to a fresh instance). */
  repoLock?: KeyedLock;
  /** Injectable to force a truncated-hash collision in tests. */
  idForBranch?: (branch: string) => string;
}

const STATE_TO_STATUS: Record<OperationRecord['state'], OperationStatus['status']> = {
  pending: 'cloning',
  running: 'cloning',
  succeeded: 'ready',
  failed: 'error',
  aborted: 'aborted',
};

const opKey = (repoId: string, wtId: string): string => `${repoId}/${wtId}`;

/** Split a `<repo-id>/<wt-id>` key back into its target + wt-id (owner/repo are slash-free). */
function partsForKey(key: string): { target: RepoTarget; repoId: string; wtId: string } {
  const [owner, repo, wtId] = key.split('/');
  return { target: { owner, repo }, repoId: `${owner}/${repo}`, wtId };
}

function toStatus(record: OperationRecord): OperationStatus {
  return {
    repoId: record.key,
    operationId: record.id,
    status: STATE_TO_STATUS[record.state],
    ...(record.state === 'failed' ? { error: { kind: 'git-failure' as const } } : {}),
  };
}

export function createWorktreeOrchestrator(
  ctx: RuntimeContext,
  deps: WorktreeOrchestratorDeps = {},
): WorktreeOrchestrator {
  const worktreeService =
    deps.worktreeService ?? createWorktreeService(ctx, { runner: deps.runner });
  const idForBranch = deps.idForBranch ?? defaultIdForBranch;
  // The per-`<repo-id>` git-mutation lock — independent of the ledger's per-operation-key lock.
  const repoLock = deps.repoLock ?? createKeyedLock();

  const ledger: OperationLedger = createOperationLedger({
    root: join(ctx.workspaceRoot, 'operations'),
    clock: deps.clock,
    processProbe: deps.processProbe,
    handlers: {
      worktree: {
        isComplete: (record) => {
          const { target, wtId } = partsForKey(record.key);
          return worktreeService.isWorktreeComplete(target, wtId);
        },
        cleanup: (record) => {
          const { target, repoId, wtId } = partsForKey(record.key);
          // Cleanup is a git mutation → serialize under the per-repo lock.
          return repoLock.run(repoId, () =>
            worktreeService.removeWorktreeIfIncomplete(target, wtId),
          );
        },
      },
    },
  });

  return {
    async startCreate(input) {
      const repoId = toRepoId(input.target);
      const wtId = idForBranch(input.branch);
      const key = opKey(repoId, wtId);

      const op = await ledger.start({
        type: 'worktree',
        key,
        metadata: { branch: input.branch },
        run: ({ signal, setPid }) =>
          // git mutations to the shared bare repo serialize under the per-repo lock.
          repoLock.run(repoId, () =>
            worktreeService.createWorktree(input, {
              signal,
              onSpawn: (pid) => void setPid(pid),
            }),
          ),
      });

      // Idempotent reuse gates on branch equality FIRST: a same-key op recorded for a DIFFERENT
      // branch is a truncated-hash collision — reject it here, never alias it onto that operation.
      if (op.metadata?.branch !== undefined && op.metadata.branch !== input.branch) {
        throw new WorktreeCollisionError();
      }
      return toStatus(op);
    },

    async abortCreate(repoId, wtId) {
      const record = await ledger.abort(opKey(repoId, wtId));
      return record ? toStatus(record) : null;
    },

    async getStatus(repoId, wtId) {
      const record = await ledger.get(opKey(repoId, wtId));
      return record ? toStatus(record) : null;
    },

    listWorktrees: (target) => worktreeService.listWorktrees(target),

    removeWorktree: (target, wtId) =>
      repoLock.run(toRepoId(target), () => worktreeService.removeWorktree(target, wtId)),

    reconcile: () => ledger.reconcile(),

    async whenSettled(repoId, wtId) {
      const key = opKey(repoId, wtId);
      await ledger.whenSettled(key);
      return this.getStatus(repoId, wtId);
    },
  };
}
