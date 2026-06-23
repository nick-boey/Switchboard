import { isSafeBranchName, type WorktreeMode, type WorktreeSummary } from '@switchboard/shared';

/**
 * Pure UI-model helpers for the worktrees-hub slice (ported from the `ui-prototypes-mvp`
 * worktrees prototype — not imported). The safe-to-delete classification mirrors the server's
 * predicate for the inputs the web has: a worktree is presented as safe only when its PR is merged
 * and it has no uncommitted changes. Since the MVP wires **no** PR-status source, `prMerged` is
 * always undefined → no worktree is ever presented as safe (the lit styling is dormant), so the
 * delete control always confirms before removing.
 */
export function isWorktreeSafeToDelete(wt: Pick<WorktreeSummary, 'dirty' | 'prMerged'>): boolean {
  return wt.prMerged === true && !wt.dirty;
}

/** PR lamp state derived from the (MVP-absent) merged-PR flag — display-only. */
export function prLampStatus(wt: Pick<WorktreeSummary, 'prMerged'>): 'merged' | 'none' {
  return wt.prMerged === true ? 'merged' : 'none';
}

export interface CreateWorktreeFormState {
  mode: WorktreeMode;
  /** For `new`: the new branch name; for `existing-remote`: the selected remote branch. */
  branch: string;
  /** For `new`: the base branch (optional — defaults to the repo's default branch server-side). */
  base?: string;
}

/** Create is enabled only for a valid (non-empty, safe) branch selection. */
export function canCreateWorktree(state: CreateWorktreeFormState): boolean {
  return isSafeBranchName(state.branch);
}
