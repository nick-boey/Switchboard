---
depends-on: []
---

No active change must land before this one — it is Phase 1 of the branches programme.

- **`page-routing`** is **not** listed: it is already merged to `main` (PR #19) and is part of
  the baseline this change builds on (the TanStack Router code-based tree + the home route this
  change adds `validateSearch` to). It is a baseline, not a pending dependency.
- **`pr-indicators`** (Phase 2) depends on **this** change, not the reverse. That ordering will be
  recorded in `pr-indicators`'s own `dependencies.md` when Phase 2 reaches its dependencies artifact
  (that file does not exist yet — Phase 2 is still at `plan`); for now the ordering is arbitrated by
  the shared plan page `docs/plans/switchboard/branches-and-pr-indicators.md`.
- No capability overlap with another *active* change: `pr-indicators` will carry delta specs for
  `github-repos` / `repos-home`, but it is gated behind this change, so the split is ordered.
