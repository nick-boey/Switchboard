/**
 * Typed worktree errors (design Decisions 1, 4, 6). Each carries a stable `kind` and NO sensitive
 * detail (no branch name, `<wt-id>`, or path in the message — no-leak, Decision 7). The orchestrator
 * maps `kind` onto the operation/route error shapes; the Git-service collision check and the
 * orchestrator boundary throw the **same** `WorktreeCollisionError`.
 */

export type WorktreeErrorKind =
  | 'wt-collision'
  | 'no-clone'
  | 'branch-exists'
  | 'branch-not-found'
  | 'not-safe'
  | 'git-failure';

export class WorktreeError extends Error {
  constructor(
    readonly kind: WorktreeErrorKind,
    message?: string,
  ) {
    super(message ?? `worktree operation failed (${kind})`);
    this.name = 'WorktreeError';
  }
}

/**
 * A create whose `<wt-id>` would collide with an existing worktree on a **different** branch
 * (Decision 1). Raised both in the Git service (on-disk check) and at the orchestrator boundary
 * (branch-equality check against the operation metadata) — never aliased, never extended.
 */
export class WorktreeCollisionError extends WorktreeError {
  constructor() {
    super('wt-collision', 'worktree id collides with a different branch');
    this.name = 'WorktreeCollisionError';
  }
}

/** A delete refused because the worktree is not safe to delete and no `force` was supplied. */
export class WorktreeNotSafeError extends WorktreeError {
  constructor() {
    super('not-safe', 'worktree is not safe to delete');
    this.name = 'WorktreeNotSafeError';
  }
}
