---
depends-on:
  - worktree-management
---

`claude-session-launch` depends on `worktree-management`: a session is launched **inside** a
worktree (`tmux` rooted at `repos/<repo-id>/worktrees/<wt-id>`), and the tmux session name
**reuses the canonical path-safe ID scheme designed in `worktree-management`**. A worktree
must therefore exist, and the ID scheme must be defined, before a session can launch
(programme page, [Change roadmap](../../../docs/plans/switchboard/mvp.md#change-roadmap)).
This transitively depends on `repo-clone-browse` and `ui-prototypes-mvp`.

`foundations` (archived) is a satisfied dependency and is not relisted.

**Capability overlap:** `session-launch` / `session-list` are new. The reuse of the path-safe
ID scheme from `worktree-management` is ordered by this `depends-on` edge, not duplicated.
The programme page is the shared arbiter.
