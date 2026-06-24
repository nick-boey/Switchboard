import type { PlugSessionStatus } from '@switchboard/shared';
import type { PlugStatus } from '../ui/plug';

/**
 * Pure session→plug-status model for the worktrees-hub slice (design Decision 5). The session
 * status is derived from tmux liveness (re-read every query — tmux is the source of truth) plus the
 * in-flight / failed launch-or-stop mutation state, then mapped to the plug's visual. Because
 * `live` comes from the next liveness read, the displayed status self-corrects after an external
 * change (a session killed outside Switchboard reads `off` on the next read).
 *
 * This is web UI-model logic only — no `src/prototypes/**` import (the quarantine holds).
 */

export interface SessionStatusInput {
  /** A live tmux session exists for this worktree (from the liveness query — tmux truth). */
  live: boolean;
  /** A launch or stop mutation is in flight (optimistic transient). */
  pending: boolean;
  /** The last launch or stop resolved to a typed error. */
  failed: boolean;
}

/**
 * Derive the worktree's session status (Decision 5): `starting` while a mutation is in flight
 * (optimistic, guarded), then `error` on a failed launch/stop, else `on`/`off` re-derived from tmux
 * liveness. Pending wins so the plug shows the transient immediately and self-corrects on the next
 * read.
 */
export function deriveSessionStatus({
  live,
  pending,
  failed,
}: SessionStatusInput): PlugSessionStatus {
  if (pending) return 'starting';
  if (failed) return 'error';
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
