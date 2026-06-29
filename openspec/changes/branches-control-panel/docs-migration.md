# Documentation migration: branches-control-panel

Ledger of where this change's planning documentation graduates to and what permanent
documentation the change must author. Every row MUST reach `resolved` before archive; every Plans
page linked in plan.md MUST have a row.

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| `docs/dev/Architecture/Planned/branches-control-panel.c4` | `docs/dev/Architecture/model.c4` + `views.c4` | merge → docs/dev/Architecture/model.c4 (graduate `branchService` + its `gitService`/`worktreeService`/`credentialHelper`/`GitHub` edges into `model.c4` and the `branches-control-panel-api` view into `views.c4`, strip every `#todo`, then delete the overlay file) | open |
| `docs/plans/switchboard/branches-and-pr-indicators.md` (Phase-1 content) | — | retire — trim the Phase-1 sections at this change's archive; the page survives because its `openspec-changes` frontmatter still lists the active `pr-indicators`, and is fully retired when that change archives | open |
| — (new content) | `docs/user/running-switchboard.md` | merge → docs/user/running-switchboard.md (document the home control panel + branch search/filters, the six-state branch indicator and its tooltip, creating a worktree from a branch via the dashed plug, and the branch-lamp colour change vs the prior git lamp) | open |
| plan.md "Architecture summary" + Decisions | — | discard — superseded by the delta specs, `design.md`, the graduated `.c4`, and the user-doc update; retained only inside the archived change folder | open |
