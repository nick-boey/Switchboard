import { join } from 'node:path';
import {
  parseRepoTarget,
  tmuxSessionName,
  type OperationStatus,
  type RepoTarget,
  type RuntimeContext,
  type SessionSummary,
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
import { createSessionProbe } from './session-probe.js';
import type { TmuxRunner } from './tmux-runner.js';

/**
 * Session-launch-through-the-ledger orchestration (design Decision 2). A launch starts
 * `claude --remote-control` DETACHED in a tmux session rooted at the worktree, tracked as a
 * `session`-typed operation keyed `session/<repo-id>/<wt-id>` — a namespace DISTINCT from the
 * worktree-create key `<repo-id>/<wt-id>`. The ledger buys idempotency + the transient `starting`
 * state; the live tmux session (not the record) is the durable success marker, so **liveness is
 * always re-derived from tmux** (Decision 4). Launch, the stale-record reconcile (Decision 2), and
 * stop's kill (Decision 6) all serialize on ONE shared per-session `KeyedLock`.
 *
 * The orchestrator depends on the worktree service for the worktree path + existence (launch
 * targets a real checkout) and listing (the candidate set for `listSessions`); the `SessionProbe`
 * it uses for liveness/listing depends ONLY on tmux (no worktree back-edge), so wiring it into the
 * worktree orchestrator introduces no cycle (Decision 4).
 */

/** The detached launch command, passed as argv (never a shell line). */
const CLAUDE_LAUNCH_COMMAND: readonly string[] = ['claude', '--remote-control'];

/** The minimal worktree-service surface the session slice needs (the real service satisfies it). */
export interface SessionWorktreeView {
  worktreePath(target: RepoTarget, wtId: string): string;
  isWorktreeComplete(target: RepoTarget, wtId: string): Promise<boolean>;
  listWorktrees(target: RepoTarget): Promise<WorktreeSummary[]>;
}

/** A typed launch failure — carries only a kind, never raw subprocess text (no-leak). */
export class SessionLaunchError extends Error {
  constructor(readonly kind: string) {
    super(`session launch failed (${kind})`);
    this.name = 'SessionLaunchError';
  }
}

export interface SessionOrchestrator {
  /** Launch (or idempotently reuse) a session; returns the launch op's status. */
  launchSession(repoId: string, wtId: string): Promise<OperationStatus>;
  /** Stop a session (kill its tmux session); idempotent, serialized with launch (Decision 6). */
  stopSession(repoId: string, wtId: string): Promise<void>;
  /** The launch operation's status (the `starting`/`error` poll target). */
  getLaunchStatus(repoId: string, wtId: string): Promise<OperationStatus | null>;
  /** Existence + worktree mapping for the repo's live sessions (Decision 4). */
  listSessions(target: RepoTarget): Promise<SessionSummary[]>;
  /** Resolve once the current launch worker for this session has settled (test/stop aid). */
  whenSettled(repoId: string, wtId: string): Promise<OperationStatus | null>;
  reconcile(): Promise<void>;
}

export interface SessionOrchestratorDeps {
  worktreeService: SessionWorktreeView;
  tmuxRunner: TmuxRunner;
  clock?: Clock;
  processProbe?: ProcessProbe;
  /** The shared per-session `KeyedLock` (launch + stop + reconcile lock the same key). */
  lock?: KeyedLock;
}

const STATE_TO_STATUS: Record<OperationRecord['state'], OperationStatus['status']> = {
  pending: 'cloning',
  running: 'cloning',
  succeeded: 'ready',
  failed: 'error',
  aborted: 'aborted',
};

/** The per-session operation key — a namespace distinct from worktree-create's `<repo-id>/<wt-id>`. */
export const sessionKey = (repoId: string, wtId: string): string => `session/${repoId}/${wtId}`;

/** Split a `session/<owner>/<repo>/<wt-id>` key back into its parts (owner/repo are slash-free). */
function partsForKey(key: string): { target: RepoTarget; repoId: string; wtId: string } {
  const [, owner, repo, wtId] = key.split('/');
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

export function createSessionOrchestrator(
  ctx: RuntimeContext,
  deps: SessionOrchestratorDeps,
): SessionOrchestrator {
  const { worktreeService, tmuxRunner } = deps;
  // ONE shared per-session lock — launch (via the ledger), the stale-record reconcile, and stop's
  // kill all take this same key, so the three are mutually exclusive (Decision 6).
  const lock = deps.lock ?? createKeyedLock();
  // Liveness/listing derive from tmux truth only (no worktree back-edge, Decision 4).
  const probe = createSessionProbe(tmuxRunner);

  const ledger: OperationLedger = createOperationLedger({
    root: join(ctx.workspaceRoot, 'operations'),
    clock: deps.clock,
    processProbe: deps.processProbe,
    lock,
    handlers: {
      session: {
        // The live tmux session IS the op's durable success marker (Decision 2).
        reuseRequiresMarker: true,
        isComplete: (record) => {
          const { repoId, wtId } = partsForKey(record.key);
          return tmuxRunner.hasSession(tmuxSessionName(repoId, wtId));
        },
        // Kill a half-launched session (gated on !isComplete by the ledger); a no-op when absent.
        cleanup: (record) => {
          const { repoId, wtId } = partsForKey(record.key);
          return tmuxRunner.killSession(tmuxSessionName(repoId, wtId));
        },
      },
    },
  });

  return {
    async launchSession(repoId, wtId) {
      const target = parseRepoTarget(repoId)!; // route-validated `<repo-id>`
      const key = sessionKey(repoId, wtId);
      const name = tmuxSessionName(repoId, wtId);

      const op = await ledger.start({
        type: 'session',
        key,
        run: async () => {
          // Launch requires an existing worktree (spec) — a typed failure, never a 500.
          if (!(await worktreeService.isWorktreeComplete(target, wtId))) {
            throw new SessionLaunchError('no-worktree');
          }
          const path = worktreeService.worktreePath(target, wtId);
          // Telemetry (Decision 7): the name, path, `(repoId, wtId)`, and argv go under
          // blocklisted `session.*` keys so the redactor masks them — never plain attributes.
          ctx.telemetry
            .startSpan('session.launch', {
              'session.name': name,
              'session.repoId': repoId,
              'session.wtId': wtId,
              'session.path': path,
              'session.argv': CLAUDE_LAUNCH_COMMAND.join(' '),
            })
            .end();
          await tmuxRunner.newSession(name, path, [...CLAUDE_LAUNCH_COMMAND]);
        },
      });
      return toStatus(op);
    },

    async stopSession(repoId, wtId) {
      const key = sessionKey(repoId, wtId);
      const name = tmuxSessionName(repoId, wtId);
      // Drain-then-lock loop (Decision 6). Drain OUTSIDE the lock so an in-flight launch worker can
      // reacquire the key lock to settle (awaiting settlement while holding the lock would deadlock);
      // then kill UNDER the lock (mutual exclusion with launch's ledger writes). Re-drain if a launch
      // registered between the drain and the lock (its worker spawns the session outside the lock).
      for (;;) {
        await ledger.whenSettled(key);
        const done = await lock.run(key, async () => {
          const rec = await ledger.get(key);
          if (rec && (rec.state === 'pending' || rec.state === 'running')) return false;
          ctx.telemetry
            .startSpan('session.stop', {
              'session.name': name,
              'session.repoId': repoId,
              'session.wtId': wtId,
            })
            .end();
          await tmuxRunner.killSession(name); // idempotent — a no-op when already absent
          return true;
        });
        if (done) break;
      }
    },

    async getLaunchStatus(repoId, wtId) {
      const record = await ledger.get(sessionKey(repoId, wtId));
      return record ? toStatus(record) : null;
    },

    async listSessions(target) {
      // Iterate the repo's EXISTING worktrees, forward-derive each session name through the probe,
      // and return existence + mapping only (Decision 4). A deleted worktree's orphan has left this
      // set — it cannot be derived (names are never decoded) and is therefore out of scope.
      const repoId = `${target.owner}/${target.repo}`;
      const worktrees = await worktreeService.listWorktrees(target);
      const sessions: SessionSummary[] = [];
      for (const wt of worktrees) {
        if (await probe.hasActiveSession(repoId, wt.wtId)) {
          sessions.push({ repoId, wtId: wt.wtId, status: 'on' });
        }
      }
      return sessions;
    },

    async whenSettled(repoId, wtId) {
      const key = sessionKey(repoId, wtId);
      await ledger.whenSettled(key);
      return this.getLaunchStatus(repoId, wtId);
    },

    reconcile: () => ledger.reconcile(),
  };
}
