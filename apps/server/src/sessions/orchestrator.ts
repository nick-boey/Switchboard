import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  parseRepoTarget,
  sessionDisplayName,
  tmuxSessionName,
  type BridgeSessionId,
  type RepoTarget,
  type RuntimeContext,
  type SessionLaunchErrorKind,
  type SessionLaunchState,
  type SessionLaunchStatus,
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
import { readSessionStateIndex, resolveBridgeSessionId } from './session-link-resolver.js';
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

/** Options for the composable launch-argv builder (plan Decision 10 / design Decision 2). */
export interface LaunchArgvOptions {
  /**
   * The fresh per-launch UUID v4 — the bridge-id resolver's exact join key, recorded in the
   * operation ledger and matched against claude's per-session state (`session-web-link`).
   */
  sessionId: string;
  /**
   * The human-readable `<repo>/<branch-slug>` Claude display name (`name-sessions`). Claude is named
   * on BOTH surfaces: `--name` (the prompt-box / `/resume` / terminal-title display name) and
   * `--remote-control=<name>` (the Remote Control session label). The `=` form is REQUIRED —
   * `--remote-control` takes an *optional* value commander will not bind from a space-separated token,
   * so a bare `--remote-control <name>` would leave the session auto-named.
   */
  name: string;
}

/**
 * Build the detached launch argv (plan Decision 10 / design Decision 2), passed as ARGV (never a
 * shell line). This is the SINGLE composition point for the slice's launch flags: the bridge-id
 * resolver's join key `--session-id <uuid>` (`session-web-link`) composed with the `name-sessions`
 * naming on both surfaces — `--remote-control=<name>` + `--name <name>`. `--session-id` is the
 * resolver's only exact join key, so a unit test pins that it survives alongside the name flags and
 * can never be dropped or reordered out (the drop-guard invariant).
 */
export function buildLaunchArgv({ sessionId, name }: LaunchArgvOptions): string[] {
  return ['claude', '--session-id', sessionId, `--remote-control=${name}`, '--name', name];
}

/** The minimal worktree-service surface the session slice needs (the real service satisfies it). */
export interface SessionWorktreeView {
  worktreePath(target: RepoTarget, wtId: string): string;
  isWorktreeComplete(target: RepoTarget, wtId: string): Promise<boolean>;
  listWorktrees(target: RepoTarget): Promise<WorktreeSummary[]>;
}

/** A typed launch failure — carries only a SESSION kind, never raw subprocess text (no-leak). */
export class SessionLaunchError extends Error {
  constructor(readonly kind: SessionLaunchErrorKind) {
    super(`session launch failed (${kind})`);
    this.name = 'SessionLaunchError';
  }
}

export interface SessionOrchestrator {
  /** Launch (or idempotently reuse) a session; returns the SESSION launch status. */
  launchSession(repoId: string, wtId: string): Promise<SessionLaunchStatus>;
  /** Stop a session (kill its tmux session); idempotent, serialized with launch (Decision 6). */
  stopSession(repoId: string, wtId: string): Promise<void>;
  /** The launch operation's SESSION status (the `starting`/`error` poll target). */
  getLaunchStatus(repoId: string, wtId: string): Promise<SessionLaunchStatus | null>;
  /** Existence + worktree mapping for the repo's live sessions (Decision 4). */
  listSessions(target: RepoTarget): Promise<SessionSummary[]>;
  /** Resolve once the current launch worker for this session has settled (test/stop aid). */
  whenSettled(repoId: string, wtId: string): Promise<SessionLaunchStatus | null>;
  reconcile(): Promise<void>;
}

export interface SessionOrchestratorDeps {
  worktreeService: SessionWorktreeView;
  tmuxRunner: TmuxRunner;
  clock?: Clock;
  processProbe?: ProcessProbe;
  /** The shared per-session `KeyedLock` (launch + stop + reconcile lock the same key). */
  lock?: KeyedLock;
  /**
   * Build the cloud bridge-id index for `listSessions` enrichment (`session-web-link` Decision 3).
   * Called AT MOST ONCE per `listSessions` call (a single bounded scan of `~/.claude/sessions`).
   * Defaults to the real reader wired to `ctx.telemetry`; tests fixture it off the real home.
   */
  readBridgeIndex?: () => Promise<ReadonlyMap<string, BridgeSessionId>>;
}

/**
 * The ledger op state → SESSION launch status (Decision 2 + 5). The clone vocabulary
 * (`cloning`/`git-failure`) is DELIBERATELY not reused: an in-flight launch is `starting` (the spec's
 * transient), a settled-ok launch is `ready`, a failed launch is `error`. Liveness stays
 * tmux-authoritative — a `ready` record whose session vanished still reads `off` downstream.
 */
const STATE_TO_SESSION_STATUS: Record<OperationRecord['state'], SessionLaunchState> = {
  pending: 'starting',
  running: 'starting',
  succeeded: 'ready',
  failed: 'error',
  aborted: 'aborted',
};

/**
 * The ledger's stored failure `kind` → a typed SESSION failure kind. The session worker raises
 * `SessionLaunchError('no-worktree')` and the tmux seam raises `TmuxLaunchError` (kind
 * `tmux-failure`); any other/unclassified failure (the ledger's `git-failure` default) collapses to
 * the generic `launch-failed` — never the clone `git-failure` kind.
 */
const LEDGER_KIND_TO_SESSION_KIND: Record<string, SessionLaunchErrorKind> = {
  'no-worktree': 'no-worktree',
  'tmux-failure': 'tmux-failure',
  'launch-failed': 'launch-failed',
};

/** The per-session operation key — a namespace distinct from worktree-create's `<repo-id>/<wt-id>`. */
export const sessionKey = (repoId: string, wtId: string): string => `session/${repoId}/${wtId}`;

/** Split a `session/<owner>/<repo>/<wt-id>` key back into its parts (owner/repo are slash-free). */
function partsForKey(key: string): { target: RepoTarget; repoId: string; wtId: string } {
  const [, owner, repo, wtId] = key.split('/');
  return { target: { owner, repo }, repoId: `${owner}/${repo}`, wtId };
}

function toSessionStatus(record: OperationRecord): SessionLaunchStatus {
  return {
    repoId: record.key,
    operationId: record.id,
    status: STATE_TO_SESSION_STATUS[record.state],
    ...(record.state === 'failed'
      ? {
          error: { kind: LEDGER_KIND_TO_SESSION_KIND[record.error?.kind ?? ''] ?? 'launch-failed' },
        }
      : {}),
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
  // The bridge-id index reader (`session-web-link` Decision 3): the real bounded `~/.claude/sessions`
  // scan wired to `ctx.telemetry` by default; tests inject a fixtured one. `sessionService` owns the
  // ledger read and passes each recorded UUID into the PURE lookup — the resolver has no ledger edge.
  const readBridgeIndex =
    deps.readBridgeIndex ?? (() => readSessionStateIndex({ telemetry: ctx.telemetry }));

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
      // A fresh random UUID v4 per launch (plan Decisions 1/4): a new-conversation-per-launch join
      // key. The ledger writes `metadata` only on a NEW record, so an idempotent reuse keeps the
      // original UUID (one session) and only a genuinely new op (including the stale-record reconcile
      // after an external kill) records this fresh one — see `metadata` below.
      const uuid = randomUUID();
      // The human-readable `<repo>/<branch-slug>` Claude names itself with (name-sessions); rides
      // only inside argv (composed with the resolver join key by the single argv builder).
      const displayName = sessionDisplayName(repoId, wtId);

      const op = await ledger.start({
        type: 'session',
        key,
        // The ledger writes metadata on a NEW record only (ledger.ts) — so an idempotent in-flight
        // reuse keeps the original UUID (one session, one join key), while a genuinely new op (a
        // relaunch after stop, OR the stale-`succeeded`-record reconcile after an external kill)
        // records THIS fresh UUID. The resolver thus always joins on the live session, never a dead
        // one (design Decision 1 / session-launch spec).
        metadata: { sessionId: uuid },
        run: async () => {
          // Launch requires an existing worktree (spec) — a typed failure, never a 500.
          if (!(await worktreeService.isWorktreeComplete(target, wtId))) {
            throw new SessionLaunchError('no-worktree');
          }
          const path = worktreeService.worktreePath(target, wtId);
          const argv = buildLaunchArgv({ sessionId: uuid, name: displayName });
          // Telemetry (Decision 7): the name, path, `(repoId, wtId)`, and argv go under
          // blocklisted `session.*` keys so the redactor masks them — never plain attributes. The
          // display name rides ONLY inside `session.argv`, so `session.*` keeps it redacted too.
          ctx.telemetry
            .startSpan('session.launch', {
              'session.name': name,
              'session.repoId': repoId,
              'session.wtId': wtId,
              'session.path': path,
              'session.argv': argv.join(' '),
            })
            .end();
          await tmuxRunner.newSession(name, path, argv);
        },
      });
      return toSessionStatus(op);
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
      return record ? toSessionStatus(record) : null;
    },

    async listSessions(target) {
      // Iterate the repo's EXISTING worktrees, forward-derive each session name through the probe,
      // and return existence + mapping (Decision 4) plus an optional resolved bridge id
      // (`session-web-link`). A deleted worktree's orphan has left this set — it cannot be derived
      // (names are never decoded) and is therefore out of scope.
      const repoId = `${target.owner}/${target.repo}`;
      const worktrees = await worktreeService.listWorktrees(target);
      const live: WorktreeSummary[] = [];
      for (const wt of worktrees) {
        if (await probe.hasActiveSession(repoId, wt.wtId)) live.push(wt);
      }
      // Build the bridge-id index ONCE per call — only when there is a live session to enrich
      // (`session-web-link` Decision 7). The scan is bounded + best-effort; it never gates liveness.
      const bridgeIndex = live.length > 0 ? await readBridgeIndex() : undefined;
      const sessions: SessionSummary[] = [];
      for (const wt of live) {
        // `sessionService` owns the ledger read: the live session's recorded launch UUID is the exact
        // join key passed into the pure resolver. No recorded UUID (server restart, pre-change record,
        // a session launched outside Switchboard) ⇒ no link — never a `cwd` guess.
        const recorded = (await ledger.get(sessionKey(repoId, wt.wtId)))?.metadata?.sessionId;
        const bridgeSessionId = bridgeIndex
          ? resolveBridgeSessionId(bridgeIndex, recorded)
          : undefined;
        sessions.push({
          repoId,
          wtId: wt.wtId,
          status: 'on',
          ...(bridgeSessionId ? { bridgeSessionId } : {}),
        });
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
