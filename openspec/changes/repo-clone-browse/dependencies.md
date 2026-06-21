---
depends-on:
  - ui-prototypes-mvp
---

`repo-clone-browse` **hard-depends on `ui-prototypes-mvp`**: the upfront prototypes are a
real user-story confirmation gate, so backend work cannot start until the repo-browser /
clone screens are confirmed (programme page,
[Change roadmap](../../../docs/plans/switchboard/mvp.md#change-roadmap)).

`foundations` (archived — its specs are merged into `openspec/specs/`) provides the harness
this change builds on. An archived change is a satisfied dependency, so it is not relisted
here.

**Capability overlap:** `github-repos` and `repo-clone` are new and not carried by any other
active change. The shared arbiter for cross-change decisions is the programme page, which
lists all active changes in its `openspec-changes` frontmatter. This change is first in the
feature chain `repo-clone-browse → worktree-management → claude-session-launch`.
