---
depends-on:
  - repo-clone-browse
---

`worktree-management` depends on `repo-clone-browse`: a worktree is created **inside** a
bare clone (`repos/<repo-id>/.bare` → `repos/<repo-id>/worktrees/<wt-id>`), so a repo must be
cloned on disk before a worktree can exist (programme page,
[Change roadmap](../../../docs/plans/switchboard/mvp.md#change-roadmap)). This transitively
depends on `ui-prototypes-mvp` through `repo-clone-browse`.

`foundations` (archived) is a satisfied dependency and is not relisted.

**Capability overlap:** `worktree-management` is a new capability. It shares the **canonical
path-safe ID scheme** with `claude-session-launch` (which reuses it for tmux session names);
that scheme is **designed here** and that change depends on this one, so the split is ordered
by `depends-on` rather than duplicated. The programme page is the shared arbiter.
