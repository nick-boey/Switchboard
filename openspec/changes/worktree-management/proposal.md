## Why

A cloned repo alone cannot host a Claude session — a session needs a checked-out working
tree. This change creates worktrees (and their branches) on a path-safe, collision-free
identity scheme, the second link in the feature chain.

## What Changes

- Add worktree creation: from a cloned repo, create a worktree + branch at
  `repos/<repo-id>/worktrees/<wt-id>`.
- Handle **"branch exists on remote"** vs **"new branch"** explicitly.
- Define and implement the **canonical path-safe ID scheme**: encode/hash adversarial
  branch names into `<wt-id>`; store the human-readable branch name separately; expose the
  id ↔ owner/repo/branch mapping for reuse by `claude-session-launch` (tmux naming).
- Run worktree creation through the **operation ledger + lock**.
- List a repo's worktrees from disk.
- Refine the worktree-list / create slice of the `ui-prototypes-mvp` prototypes into real UI.

## Capabilities

### New Capabilities

- `worktree-management`: create/list worktrees at `repos/<repo-id>/worktrees/<wt-id>`,
  branch existence handling, and the canonical path-safe ID scheme (id ↔ owner/repo/branch
  mapping), with the operation ledger/lock.

### Modified Capabilities

<!-- Confirmed at full planning. -->
- (none expected — to be confirmed at full planning)

## Impact

- `apps/server`: Git-service worktree operations, worktree route + handler, ID-scheme
  module, operation ledger/lock.
- `packages/shared`: Zod schemas for worktree create/list and the canonical ID mapping
  (reused by `claude-session-launch`).
- `apps/web`: worktree list + create UI (refining `ui-prototypes-mvp` prototypes).
- Architecture: `docs/dev/Architecture/Planned/worktree-management.c4` (authored at full
  planning).
- Filesystem: `repos/<repo-id>/worktrees/<wt-id>/`.
