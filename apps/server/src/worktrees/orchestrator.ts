import { randomUUID } from 'node:crypto';
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
import { WorktreeCollisionError, WorktreeNotSafeError } from './errors.js';
import {
  createWorktreeService,
  type WorktreeCreateInput,
  type WorktreeService,
} from './git-worktree.js';
import { safeToDelete } from './safe-to-delete.js';
import { noPrStatusProbe, noSessionProbe, type PrStatusProbe, type SessionProbe } from './seams.js';

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
  /**
   * Delete a worktree, gated by a server-side re-check of the safe-to-delete predicate. Refuses
   * (typed `not-safe`) when the worktree is not safe and no `force` is supplied; runs the removal
   * under the per-repo git-mutation lock. Removes ONLY the checkout (never the bare clone,
   * siblings, or the branch — enforced in the Git service).
   */
  deleteWorktree(target: RepoTarget, wtId: string, options?: { force?: boolean }): Promise<void>;
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
  /** Session-liveness seam (claude-session-launch wires it; defaults to "no active session"). */
  sessionProbe?: SessionProbe;
  /** PR-status seam (no MVP source; defaults to "not merged" → auto-safe path dormant). */
  prStatusProbe?: PrStatusProbe;
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
  const sessionProbe = deps.sessionProbe ?? noSessionProbe;
  const prStatusProbe = deps.prStatusProbe ?? noPrStatusProbe;
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
          // The failed operation's own ownership token (recorded in metadata at start). Threading it
          // here is what makes cleanup operation-scoped: it may delete the destination ONLY when an
          // ownership marker carries THIS exact token — never a path marked by a different op/user.
          const expectedToken = record.metadata?.token;
          // Cleanup is a git mutation → serialize under the per-repo lock.
          return repoLock.run(repoId, () =>
            worktreeService.removeWorktreeIfIncomplete(target, wtId, expectedToken),
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
      // This attempt's unique operation-scoped ownership token. It is recorded in the operation's
      // durable metadata (below) AND threaded into createWorktree, which writes it as the ownership
      // marker's content before any fs mutation. A retry (after a terminal op) is a NEW operation
      // with a NEW token, so a stale marker can never match a later op and re-authorize a delete.
      // On idempotent reuse the ledger keeps the in-flight op's original token; this fresh one is
      // discarded along with the unused `run` closure.
      const token = randomUUID();

      const op = await ledger.start({
        type: 'worktree',
        key,
        metadata: { branch: input.branch, token },
        run: ({ signal, setPid }) =>
          // git mutations to the shared bare repo serialize under the per-repo lock.
          repoLock.run(repoId, async () => {
            await worktreeService.createWorktree(input, {
              signal,
              token,
              // Await the durable pid persist before the runner awaits the git process (restart
              // recovery): reconcile treats a missing pid conservatively, so we shrink that window.
              onSpawn: (pid) => setPid(pid),
            });
          }),
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

    async deleteWorktree(target, wtId, options = {}) {
      const repoId = toRepoId(target);
      if (!options.force) {
        // Re-check the safe-to-delete predicate server-side (Decision 6). `dirty` is this change's
        // git status; the session/PR inputs come through the degrade-safe seams.
        const summary = (await worktreeService.listWorktrees(target)).find((w) => w.wtId === wtId);
        const inputs = {
          dirty: summary?.dirty ?? false,
          hasActiveSession: await sessionProbe.hasActiveSession(repoId, wtId),
          prMerged: await prStatusProbe.isPrMerged(repoId, wtId),
        };
        if (!safeToDelete(inputs)) throw new WorktreeNotSafeError();
      }
      await repoLock.run(repoId, () => worktreeService.removeWorktree(target, wtId));
    },

    reconcile: () => ledger.reconcile(),

    async whenSettled(repoId, wtId) {
      const key = opKey(repoId, wtId);
      await ledger.whenSettled(key);
      return this.getStatus(repoId, wtId);
    },
  };
}
