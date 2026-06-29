import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  idForBranch,
  sessionDisplayName,
  tmuxSessionName,
  type BridgeSessionId,
  type RepoTarget,
  type RuntimeContext,
  type WorktreeSummary,
} from '@switchboard/shared';
import { makeServerTestContext } from '../testing/operation-scaffolding.js';
import { fakeTmuxRunner, type FakeTmuxRunner } from '../testing/tmux-runner.js';
import { TmuxLaunchError, type TmuxRunner } from './tmux-runner.js';
import { createSessionOrchestrator, sessionKey, type SessionWorktreeView } from './orchestrator.js';

/**
 * Read the launch op's recorded `metadata.sessionId` directly from its on-disk ledger record (the
 * exact join key the bridge resolver later matches). The ledger keys each record by an
 * URI-encoded operation key under `<workspaceRoot>/operations` (design Decision 1).
 */
function recordedSessionId(ctx: RuntimeContext, repoId: string, wtId: string): string | undefined {
  const file = join(
    ctx.workspaceRoot,
    'operations',
    `${encodeURIComponent(sessionKey(repoId, wtId))}.json`,
  );
  const record = JSON.parse(readFileSync(file, 'utf8')) as { metadata?: { sessionId?: string } };
  return record.metadata?.sessionId;
}

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

  it('launches a detached session rooted at the worktree path running claude --session-id <uuid> --remote-control', async () => {
    const orch = make();
    const status = await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);

    const name = tmuxSessionName(REPO, WT_ID);
    expect(tmux.calls).toHaveLength(1);
    expect(tmux.calls[0].name).toBe(name);
    expect(tmux.calls[0].cwd).toBe(`/ws/repos/acme/widget-factory/worktrees/${WT_ID}`);
    // The argv composes the resolver join key with name-sessions naming on BOTH surfaces, as argv
    // (never a shell line): `--session-id <uuid>` + `--remote-control=<name>` + `--name <name>`,
    // where `<name>` = `widget-factory/feature-login` (repo name + `<wt-id>` minus its `--<hash>`).
    // `--session-id`'s value is a fresh UUID (its recording is asserted in group 3.3 below).
    const command = tmux.calls[0].command;
    expect(command[0]).toBe('claude');
    expect(command[command.indexOf('--session-id') + 1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(command).toContain('--remote-control=widget-factory/feature-login');
    expect(command[command.indexOf('--name') + 1]).toBe('widget-factory/feature-login');
    expect(await tmux.hasSession(name)).toBe(true);
    // The launch returns the SESSION launch status, never the clone `OperationStatus` shape: the
    // in-flight op reports the transient `starting` (not `cloning`), then settles `ready`.
    expect(status.status).toBe('starting');
    expect((await orch.getLaunchStatus(REPO, WT_ID))?.status).toBe('ready');
  });

  it('passes the derived name as argv tokens (never a shell line) even for a hostile branch', async () => {
    // A branch full of shell metacharacters still maps to a path-safe <wt-id> via idForBranch, so the
    // derived <repo>/<slug> name is composed only of the safe id charset.
    const hostileWtId = idForBranch('feature/$(rm -rf ~); `whoami` & echo pwned');
    const orch = make();
    await orch.launchSession(REPO, hostileWtId);
    await orch.whenSettled(REPO, hostileWtId);

    const displayName = sessionDisplayName(REPO, hostileWtId);
    // The name carries no shell metacharacters — only the safe slug/repo charset (`/` is the
    // <repo>/<slug> separator, not interpolation).
    expect(displayName).toMatch(/^[A-Za-z0-9._/-]+$/);
    // It reaches tmux as DISCRETE argv tokens, never interpolated into a shell line — composed by the
    // single argv builder alongside the bridge-id resolver join key (`--session-id <uuid>`).
    const command = tmux.calls[0].command;
    expect(command[0]).toBe('claude');
    expect(command).toContain(`--remote-control=${displayName}`);
    expect(command[command.indexOf('--name') + 1]).toBe(displayName);
    expect(command[command.indexOf('--session-id') + 1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
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

  it('resolves a tmux launch failure to a typed SESSION error (tmux-failure), no live session', async () => {
    const failing: TmuxRunner = {
      ...tmux,
      newSession: async () => {
        throw new TmuxLaunchError(1);
      },
    };
    const orch = make({ tmuxRunner: failing });
    await orch.launchSession(REPO, WT_ID);
    const settled = await orch.whenSettled(REPO, WT_ID);
    expect(settled?.status).toBe('error');
    // A SESSION failure kind, never the clone `git-failure` kind.
    expect(settled?.error?.kind).toBe('tmux-failure');
    expect(await tmux.hasSession(tmuxSessionName(REPO, WT_ID))).toBe(false);
  });

  it('maps an unclassified launch failure to the SESSION launch-failed kind (not git-failure)', async () => {
    const failing: TmuxRunner = {
      ...tmux,
      newSession: async () => {
        throw new Error('something opaque');
      },
    };
    const orch = make({ tmuxRunner: failing });
    await orch.launchSession(REPO, WT_ID);
    const settled = await orch.whenSettled(REPO, WT_ID);
    expect(settled?.status).toBe('error');
    expect(settled?.error?.kind).toBe('launch-failed');
  });

  it('refuses to launch for a worktree that does not exist (typed no-worktree error, no session)', async () => {
    const orch = make({
      worktreeService: fakeWorktreeView({ isWorktreeComplete: async () => false }),
    });
    await orch.launchSession(REPO, WT_ID);
    const settled = await orch.whenSettled(REPO, WT_ID);
    expect(settled?.status).toBe('error');
    expect(settled?.error?.kind).toBe('no-worktree');
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

  it('records the launch UUID as metadata.sessionId — the resolver join key', async () => {
    const orch = make();
    await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    const recorded = recordedSessionId(ctx, REPO, WT_ID);
    // The recorded UUID is well-formed AND is exactly the `--session-id` value the launch ran.
    expect(recorded).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const command = tmux.calls[0].command;
    expect(command[command.indexOf('--session-id') + 1]).toBe(recorded);
  });

  it('a relaunch after stop records a DIFFERENT UUID (a fresh conversation per launch)', async () => {
    const orch = make();
    await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    const first = recordedSessionId(ctx, REPO, WT_ID);

    await orch.stopSession(REPO, WT_ID);
    await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    const second = recordedSessionId(ctx, REPO, WT_ID);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });

  it('a relaunch after an external tmux kill records a DIFFERENT UUID (never the dead session’s)', async () => {
    const orch = make();
    await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    const name = tmuxSessionName(REPO, WT_ID);
    const first = recordedSessionId(ctx, REPO, WT_ID);

    // Killed outside Switchboard: the `succeeded` record is now STALE (its marker is gone). A
    // relaunch must NOT reuse it — it creates a fresh op recording a NEW UUID, so the resolver
    // matches the live session, never the dead one.
    tmux.setSession(name, false);
    await orch.launchSession(REPO, WT_ID);
    await orch.whenSettled(REPO, WT_ID);
    const second = recordedSessionId(ctx, REPO, WT_ID);

    expect(first).toBeDefined();
    expect(second).not.toBe(first);
    // And the live session's argv carries the NEW recorded UUID (not the dead one).
    expect(tmux.calls[1].command[tmux.calls[1].command.indexOf('--session-id') + 1]).toBe(second);
  });
});

describe('session orchestrator — listSessions (tmux truth, existence + mapping only)', () => {
  const wt = (wtId: string): WorktreeSummary => ({
    wtId,
    branch: 'b',
    path: `p/${wtId}`,
    dirty: false,
    sync: 'up-to-date',
  });
  const target: RepoTarget = { owner: 'acme', repo: 'widget-factory' };
  const liveId = 'feature-live--0123456789ab';
  const idleId = 'feature-idle--0123456789ab';

  it('lists only live sessions for the repo’s existing worktrees, mapped to (repoId, wtId)', async () => {
    const { ctx } = makeServerTestContext();
    const tmux = fakeTmuxRunner([tmuxSessionName(REPO, liveId)]);
    const orch = createSessionOrchestrator(ctx, {
      worktreeService: fakeWorktreeView({ listWorktrees: async () => [wt(liveId), wt(idleId)] }),
      tmuxRunner: tmux,
    });
    const sessions = await orch.listSessions(target);
    expect(sessions).toEqual([{ repoId: REPO, wtId: liveId, status: 'on' }]);
    rmSync(ctx.workspaceRoot, { recursive: true, force: true });
  });

  it('does not surface an orphan whose worktree was deleted (not in the existing set)', async () => {
    const { ctx } = makeServerTestContext();
    // An orphaned session is live in tmux, but its worktree no longer exists → not derivable.
    const tmux = fakeTmuxRunner([tmuxSessionName(REPO, 'deleted-wt--0123456789ab')]);
    const orch = createSessionOrchestrator(ctx, {
      worktreeService: fakeWorktreeView({ listWorktrees: async () => [wt(idleId)] }),
      tmuxRunner: tmux,
    });
    expect(await orch.listSessions(target)).toEqual([]);
    rmSync(ctx.workspaceRoot, { recursive: true, force: true });
  });

  it('attaches the resolved bridgeSessionId for a live session and omits it when unresolved', async () => {
    const { ctx } = makeServerTestContext();
    const tmux = fakeTmuxRunner();
    const otherId = 'feature-other--0123456789ab';
    const bridge = 'session_01ResolvedLiveOne9' as BridgeSessionId;
    let indexCalls = 0;
    const orch = createSessionOrchestrator(ctx, {
      worktreeService: fakeWorktreeView({ listWorktrees: async () => [wt(liveId), wt(otherId)] }),
      tmuxRunner: tmux,
      // The fixtured resolver maps ONLY `liveId`'s recorded launch UUID → a bridge id; `otherId`'s is
      // absent (the bridge has not connected). Counts calls to prove the index builds once per list.
      readBridgeIndex: async () => {
        indexCalls += 1;
        const uuid = recordedSessionId(ctx, REPO, liveId);
        return new Map(uuid ? [[uuid, bridge]] : []);
      },
    });
    // Launch both so each is live with a recorded UUID; only `liveId` resolves to a bridge id.
    await orch.launchSession(REPO, liveId);
    await orch.whenSettled(REPO, liveId);
    await orch.launchSession(REPO, otherId);
    await orch.whenSettled(REPO, otherId);

    const sessions = await orch.listSessions(target);
    expect(sessions.find((s) => s.wtId === liveId)?.bridgeSessionId).toBe(bridge);
    expect(sessions.find((s) => s.wtId === otherId)?.bridgeSessionId).toBeUndefined();
    // The bridge index is built ONCE per `listSessions` call, not once per live session (Decision 7).
    expect(indexCalls).toBe(1);
    rmSync(ctx.workspaceRoot, { recursive: true, force: true });
  });
});
