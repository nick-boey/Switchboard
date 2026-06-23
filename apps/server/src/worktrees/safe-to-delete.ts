/**
 * The safe-to-delete predicate (design Decision 6) — the prototype's "idle + PR merged" made
 * precise and conservative:
 *
 *   safeToDelete(wt) = noActiveSession(wt) AND prMerged(wt) AND NOT wt.dirty
 *
 * The server re-checks this before any destructive removal and refuses (typed `not-safe`) when it
 * is false, unless `force` is supplied. Because the merged-PR input has no MVP data source, the
 * auto-safe (non-force) path is fully specified but **dormant in the MVP** — every MVP deletion is
 * confirmation-gated via `force`.
 */
export interface SafeToDeleteInputs {
  /** Uncommitted changes present in the worktree (this change's git status — available in the MVP). */
  dirty: boolean;
  /** A live Claude session is bound to the worktree (claude-session-launch's seam; degrades to false). */
  hasActiveSession: boolean;
  /** The worktree's PR is merged (no MVP data source; degrades to false → auto-safe stays dormant). */
  prMerged: boolean;
}

export function safeToDelete(inputs: SafeToDeleteInputs): boolean {
  return !inputs.hasActiveSession && inputs.prMerged && !inputs.dirty;
}
