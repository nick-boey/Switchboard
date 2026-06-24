## Why

A cloned repo alone cannot host a Claude session — a session needs a checked-out working
tree. This change creates worktrees (and their branches) on a path-safe, collision-resistant
identity scheme, the second link in the feature chain.

## What Changes

- Add worktree creation: from a cloned repo, create a worktree + branch at
  `repos/<repo-id>/worktrees/<wt-id>`.
- Handle **"branch exists on remote"** vs **"new branch"** explicitly.
- Define and implement the **canonical path-safe ID scheme**: encode/hash adversarial
  branch names into `<wt-id>`; store the human-readable branch name separately; expose the
  id ↔ owner/repo/branch mapping for reuse by `claude-session-launch` (tmux naming). The scheme
  is **collision-resistant** (a bounded truncated-hash collision probability, not an absolute
  guarantee) with **mandatory create-time collision detection** that rejects (or deterministically
  extends) a distinct branch that would otherwise map onto an existing worktree's `<wt-id>`.
- Run worktree creation through the **operation ledger + lock**.
- List a repo's worktrees from disk, enriched with per-worktree **git status** (the git lamp's
  data).
- **Delete a worktree checkout** (the counterpart of create), gated by a server-side
  **safe-to-delete** re-check (`noActiveSession AND prMerged AND NOT dirty`). Because the
  PR-merged input has **no data source in the MVP** (the PR lamp is display-only), the auto-safe
  (non-force) path is specified but **dormant in the MVP** — every MVP deletion is
  **confirmation-gated** via an explicit `force` flag. Delete removes only the worktree checkout —
  **never** the bare clone, sibling worktrees, or the git **branch**.
- Refine the worktree-list / create / delete slice of the `ui-prototypes-mvp` prototypes into
  real UI (resolving the prototype's deferred delete-square behaviour and safe-to-delete styling).
- **Non-goal — branch lifecycle:** deleting or renaming the underlying git **branch** (local or
  remote) and bulk worktree/branch operations stay a **Future feature** (the programme page's
  "delete worktrees/branches" item); this change removes only the worktree checkout.

## Capabilities

### New Capabilities

- `worktree-management`: create / list / **delete** worktrees at
  `repos/<repo-id>/worktrees/<wt-id>` (delete removes only the checkout, gated by the
  server-side safe-to-delete re-check with force/confirm semantics), branch existence handling,
  per-worktree git status, and the **collision-resistant** canonical path-safe ID scheme with
  mandatory create-time collision detection (id ↔ owner/repo/branch mapping), all run through the
  operation ledger/lock.

### Modified Capabilities

<!-- Confirmed at full planning. -->
- (none expected — to be confirmed at full planning)

## Impact

- `apps/server`: Git-service worktree operations (create/list/delete + git status), worktree
  create/list/delete/status routes + handlers, the server-side safe-to-delete guard, the
  ID-scheme module with create-time collision detection, operation ledger/lock.
- `packages/shared`: Zod schemas for worktree create/list/delete and the canonical ID mapping
  (reused by `claude-session-launch`).
- `apps/web`: worktree list + create + delete UI, including the delete control's safe-to-delete
  styling (refining `ui-prototypes-mvp` prototypes).
- Architecture: `docs/dev/Architecture/Planned/worktree-management.c4` (authored at full
  planning).
- Filesystem: `repos/<repo-id>/worktrees/<wt-id>/`.
