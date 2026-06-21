## Why

Starting a remote-control Claude session in a worktree is the core job the official mobile
app cannot do. This change launches and tracks those sessions — the third and final link in
the feature chain that delivers the MVP user story.

## What Changes

- Add a **Session service** that launches `claude --remote-control` **detached in a tmux
  session** rooted at `repos/<repo-id>/worktrees/<wt-id>`.
- Name tmux sessions with the **canonical path-safe scheme** from `worktree-management`.
- **List/track** sessions: existence + worktree mapping only (no conversation metadata).
- Run launch through the **operation ledger + lock**.
- Rely on the host's existing `claude` login (no per-session pairing UI).
- Refine the session-list / launch slice of the `ui-prototypes-mvp` prototypes into real UI.

## Capabilities

### New Capabilities

- `session-launch`: launch `claude --remote-control` detached in tmux in a chosen worktree,
  via the operation ledger/lock.
- `session-list`: list/track existing sessions (existence + worktree mapping) using the
  path-safe tmux naming scheme.

### Modified Capabilities

<!-- Confirmed at full planning. -->
- (none expected — to be confirmed at full planning)

## Impact

- `apps/server`: Session service, launch + list routes/handlers, tmux integration reusing
  the canonical ID scheme, operation ledger/lock.
- `packages/shared`: Zod schemas for session launch/list.
- `apps/web`: session list + launch UI (refining `ui-prototypes-mvp` prototypes).
- Architecture: realizes base-model `Switchboard.Api -> TmuxHost`; adds
  `docs/dev/Architecture/Planned/claude-session-launch.c4` (authored at full planning).
- Host: tmux sessions running `claude --remote-control`.
