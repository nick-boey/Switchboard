import { join } from 'node:path';
import {
  cloneErrorKindSchema,
  parseRepoTarget,
  toRepoId,
  type CloneErrorKind,
  type CloneStatus,
  type OperationStatus,
  type RepoTarget,
  type RuntimeContext,
} from '@switchboard/shared';
import {
  createOperationLedger,
  type Clock,
  type OperationLedger,
  type OperationRecord,
  type ProcessProbe,
} from '../operations/index.js';
import { createGitService, type GitService } from './git-service.js';
import type { GitRunner } from './git-runner.js';

/**
 * The clone-through-ledger orchestration (design Decisions 3–6): run a bare clone as a tracked
 * operation so the route returns immediately and the UI polls. The Git service does the clone; the
 * operation ledger gives idempotency, per-repo serialization, abort/cancellation (with the
 * completion-race resolved as a single terminal transition), and restart recovery. Failures are
 * mapped to typed clone errors for the getting-ready error state.
 */

export interface CloneOrchestrator {
  startClone(target: RepoTarget, options?: { remoteUrl?: string }): Promise<OperationStatus>;
  abortClone(repoId: string): Promise<OperationStatus | null>;
  getStatus(repoId: string): Promise<OperationStatus | null>;
  listCloned(): Promise<RepoTarget[]>;
  reconcile(): Promise<void>;
  /** Resolve once the current clone for `repoId` settles (orchestration/test aid). */
  whenSettled(repoId: string): Promise<OperationStatus | null>;
}

export interface CloneOrchestratorDeps {
  gitService?: GitService;
  runner?: GitRunner;
  clock?: Clock;
  processProbe?: ProcessProbe;
}

const STATE_TO_CLONE_STATUS: Record<OperationRecord['state'], CloneStatus> = {
  pending: 'cloning',
  running: 'cloning',
  succeeded: 'ready',
  failed: 'error',
  aborted: 'aborted',
};

function targetForKey(repoId: string): RepoTarget {
  const target = parseRepoTarget(repoId);
  if (!target) throw new Error(`invalid repo-id: ${repoId}`);
  return target;
}

function toErrorKind(kind: string | undefined): CloneErrorKind {
  const parsed = cloneErrorKindSchema.safeParse(kind);
  return parsed.success ? parsed.data : 'git-failure';
}

function toStatus(record: OperationRecord): OperationStatus {
  const status = STATE_TO_CLONE_STATUS[record.state];
  return {
    repoId: record.key,
    operationId: record.id,
    status,
    ...(record.state === 'failed' ? { error: { kind: toErrorKind(record.error?.kind) } } : {}),
  };
}

/** A synthetic ready status for a repo cloned out-of-band (no ledger record). */
function readyStatus(repoId: string): OperationStatus {
  return { repoId, operationId: 'cloned', status: 'ready' };
}

export function createCloneOrchestrator(
  ctx: RuntimeContext,
  deps: CloneOrchestratorDeps = {},
): CloneOrchestrator {
  const gitService = deps.gitService ?? createGitService(ctx, { runner: deps.runner });

  const ledger: OperationLedger = createOperationLedger({
    root: join(ctx.workspaceRoot, 'operations'),
    clock: deps.clock,
    processProbe: deps.processProbe,
    handlers: {
      clone: {
        isComplete: (record) => gitService.isComplete(targetForKey(record.key)),
        cleanup: (record) => gitService.removeIfIncomplete(targetForKey(record.key)),
      },
    },
  });

  return {
    async startClone(target, options = {}) {
      const repoId = toRepoId(target);
      // Already-cloned is an idempotent no-op: resolve to the existing repository.
      if (gitService.isCloned(target)) {
        const existing = await ledger.get(repoId);
        return existing && existing.state === 'succeeded'
          ? toStatus(existing)
          : readyStatus(repoId);
      }
      const op = await ledger.start({
        type: 'clone',
        key: repoId,
        run: ({ signal, setPid }) =>
          gitService.cloneBare(target, {
            signal,
            // Await the durable pid persist before the runner awaits the git process (restart
            // recovery): reconcile treats a missing pid conservatively, so we shrink that window.
            onSpawn: (pid) => setPid(pid),
            remoteUrl: options.remoteUrl,
          }),
      });
      return toStatus(op);
    },

    async abortClone(repoId) {
      const record = await ledger.abort(repoId);
      return record ? toStatus(record) : null;
    },

    async getStatus(repoId) {
      const record = await ledger.get(repoId);
      if (record) return toStatus(record);
      const target = parseRepoTarget(repoId);
      if (target && gitService.isCloned(target)) return readyStatus(repoId);
      return null;
    },

    listCloned: () => gitService.listCloned(),

    reconcile: () => ledger.reconcile(),

    async whenSettled(repoId) {
      await ledger.whenSettled(repoId);
      return this.getStatus(repoId);
    },
  };
}
