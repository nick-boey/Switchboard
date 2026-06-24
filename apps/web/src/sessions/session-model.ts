import type { PlugSessionStatus, SessionLaunchState } from '@switchboard/shared';
import type { PlugStatus } from '../ui/plug';

/**
 * Pure session→plug-status model for the worktrees-hub slice (design Decision 5). The session
 * status is derived from tmux liveness (re-read every query — tmux is the source of truth), the
 * tracked launch operation's polled status, and the in-flight / failed launch-or-stop mutation
 * state, then mapped to the plug's visual. Because `live` comes from the next liveness read, the
 * displayed status self-corrects after an external change (a session killed outside Switchboard
 * reads `off` on the next read).
 *
 * The launch POST resolves the moment the ledger records a running worker (op `starting`), NOT when
 * the tmux launch settles — so the mutation's HTTP-pending state alone cannot keep the plug in
 * `starting` for a slow launch, nor surface an asynchronous launch failure. The polled `launchOp`
 * status closes that gap: a still-`starting` op holds the transient, and a settled-`error` op shows
 * the plug `error` instead of silently falling back to liveness-only `off`.
 *
 * This is web UI-model logic only — no `src/prototypes/**` import (the quarantine holds).
 */

export interface SessionStatusInput {
  /** A live tmux session exists for this worktree (from the liveness query — tmux truth). */
  live: boolean;
  /** A launch or stop mutation POST is in flight (optimistic transient, before the op is tracked). */
  pending: boolean;
  /** The launch or stop POST itself resolved to an error (HTTP failure). */
  failed: boolean;
  /**
   * The tracked launch operation's polled status for this worktree (`undefined` = none tracked).
   * Drives the transient/error AFTER the POST resolves, since the POST returns at `starting`.
   */
  launchOp?: SessionLaunchState;
}

/**
 * Derive the worktree's session status (Decision 5): `starting` while a mutation POST is in flight
 * OR the tracked launch op is still `starting` (optimistic, guarded); then `error` on a failed
 * launch/stop POST OR a settled-`error` launch op; else `on`/`off` re-derived from tmux liveness. A
 * settled-`ready` launch op defers to liveness (tmux stays authoritative, so a session killed
 * externally still reads `off`). Pending wins so the plug shows the transient immediately and
 * self-corrects on the next read.
 */
export function deriveSessionStatus({
  live,
  pending,
  failed,
  launchOp,
}: SessionStatusInput): PlugSessionStatus {
  if (pending || launchOp === 'starting') return 'starting';
  if (failed || launchOp === 'error') return 'error';
  return live ? 'on' : 'off';
}

/** The session status → plug visual mapping (Decision 5). `idle` is reserved/unused in the MVP. */
const SESSION_TO_PLUG: Record<PlugSessionStatus, PlugStatus> = {
  off: 'off',
  starting: 'working',
  on: 'running',
  error: 'error',
};

export function sessionStatusToPlug(status: PlugSessionStatus): PlugStatus {
  return SESSION_TO_PLUG[status];
}

/** What activating the plug requests for each session status (`null` = guarded, no action). */
export type SessionAction = 'launch' | 'stop';

export function plugToggleAction(status: PlugSessionStatus): SessionAction | null {
  switch (status) {
    case 'off':
      return 'launch';
    case 'on':
    case 'error':
      return 'stop';
    case 'starting':
      return null;
  }
}

/**
 * Dispatch the plug's activation for a session status (Decision 5): an `off` plug launches, a live
 * (`on`) or `error` plug stops, a transient (`starting`) plug is guarded (neither). The hub passes
 * its launch/stop mutation triggers; this keeps the launch-vs-stop decision a single pure choice.
 */
export function dispatchPlugToggle(
  status: PlugSessionStatus,
  handlers: { launch: () => void; stop: () => void },
): void {
  const action = plugToggleAction(status);
  if (action === 'launch') handlers.launch();
  else if (action === 'stop') handlers.stop();
}
