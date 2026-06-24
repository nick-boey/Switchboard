/**
 * Safe-to-delete input seams (design Decision 6). The predicate's two non-git inputs are owned by
 * OTHER changes, so this change consumes them through injected probes that **degrade safely**:
 *
 * - `SessionProbe.hasActiveSession` — owned by `claude-session-launch` (which depends on this
 *   change). Defaults to "no active session" until that change wires the real probe.
 * - `PrStatusProbe.isPrMerged` — there is **no PR-status source in the MVP** (the PR lamp is
 *   display-only), so it defaults to "not merged". The consequence (Decision 6) is that the
 *   auto-safe delete path is dormant in the MVP — every delete is confirmation-gated.
 *
 * Probes are keyed by `<repo-id>` + `<wt-id>` (never the branch — the branch is sensitive).
 */
export interface SessionProbe {
  hasActiveSession(repoId: string, wtId: string): boolean | Promise<boolean>;
}

export interface PrStatusProbe {
  isPrMerged(repoId: string, wtId: string): boolean | Promise<boolean>;
}

/** Degrade-safe default: no live Claude session is bound to any worktree. */
export const noSessionProbe: SessionProbe = {
  hasActiveSession: () => false,
};

/** Degrade-safe default: no merged-PR signal exists in the MVP (the auto-safe path stays dormant). */
export const noPrStatusProbe: PrStatusProbe = {
  isPrMerged: () => false,
};
