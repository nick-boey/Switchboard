import type { SessionLaunchState } from '@switchboard/shared';

/**
 * Per-worktree launch-op tracking for the worktrees hub (claude-session-launch Decision 5). Every
 * worktree plug is independently actionable, so a user can start launch A then launch B before A
 * settles. Tracking each launch op PER `<wt-id>` (rather than a single shared `launchingWtId` that
 * only ever held the last action) keeps every in-flight launch's `starting`/`error` status feeding
 * its own plug — so an async failure on an earlier launch still surfaces `error` instead of falling
 * back to tmux liveness and silently reading `off`.
 *
 * The tracking value is the set of `<wt-id>`s whose launch op currently governs their plug; the
 * latest polled state per id comes from that id's independent launch-status poll (the hub runs one
 * poll per tracked id). A terminal `error` is RETAINED for its row until the user stops or relaunches
 * it; a terminal `ready`/`aborted` is dropped so the plug defers to tmux liveness (tmux authoritative).
 *
 * This is web UI-model logic only — no `src/prototypes/**` import (the quarantine holds).
 */
export type LaunchTracking = ReadonlySet<string>;

/** No launch ops tracked. */
export const noLaunchTracking: LaunchTracking = new Set<string>();

/**
 * Begin (or restart) tracking a worktree's launch op. Idempotent for an already-tracked id, so a
 * relaunch of a row currently showing a terminal `error` simply keeps it tracked — its plug
 * re-enters `starting` once that row's reset launch-status poll reports `starting` again (the
 * caller resets the cached op so the row never sticks on the stale error).
 */
export function trackLaunch(tracking: LaunchTracking, wtId: string): LaunchTracking {
  if (tracking.has(wtId)) return tracking;
  const next = new Set(tracking);
  next.add(wtId);
  return next;
}

/** Stop tracking a worktree's launch op (a stop, or a row reset, supersedes its tracked op). */
export function untrackLaunch(tracking: LaunchTracking, wtId: string): LaunchTracking {
  if (!tracking.has(wtId)) return tracking;
  const next = new Set(tracking);
  next.delete(wtId);
  return next;
}

/**
 * Reconcile the tracked set when a worktree's launch op reaches a terminal state: a `ready`/`aborted`
 * op is dropped so the plug defers to tmux liveness; an `error` op is RETAINED so the row stays
 * `error` until the user acts; a still-`starting` op stays tracked (keep polling).
 */
export function settleLaunch(
  tracking: LaunchTracking,
  wtId: string,
  status: SessionLaunchState,
): LaunchTracking {
  if (status === 'starting' || status === 'error') return tracking;
  return untrackLaunch(tracking, wtId); // ready | aborted → defer to liveness
}

/**
 * The launch-op state that governs a worktree's plug — the polled status for an actively-tracked
 * `<wt-id>`, or `undefined` when that worktree is not tracked (so a stale op never leaks into an
 * untracked row).
 */
export function launchOpFor(
  tracking: LaunchTracking,
  statusByWtId: ReadonlyMap<string, SessionLaunchState | undefined>,
  wtId: string,
): SessionLaunchState | undefined {
  return tracking.has(wtId) ? statusByWtId.get(wtId) : undefined;
}

/** The worktree ids whose launch op should be polled — one independent poll per id. */
export function trackedLaunchIds(tracking: LaunchTracking): string[] {
  return [...tracking];
}
