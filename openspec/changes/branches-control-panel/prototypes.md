# Prototypes: branches-control-panel

Ledger for the UI prototypes of this change. One row per `*.stories.tsx` file under
`src/prototypes/branches-control-panel/`. The filesystem is authoritative: every prototype file
on disk MUST have exactly one row, and there MUST be no rows for files that no longer exist.
Archiving is blocked while any row is `open` or any file on disk is unlisted.

<!--
Shared helper `parts.tsx` (the new components + mock data) is not a story file, so it has no row;
its code is ported into the slice as implementation work (tasks.md), not promoted here.

Disposition vocabulary (exactly one per row):
  promote → <target path>   directly reusable story; archive does a mechanical git mv + retitle.
  delete — <reason>         subsumed by the shipped implementation, or abandoned.
Status: open (undecided) | resolved (disposition agreed).
-->

| Story file | Explores | Disposition | Status |
| --- | --- | --- | --- |
| control-panel.stories.tsx | The home control panel — search field + independent on/off filter switches (Worktrees/Local/Remote, each with its own indicator light); union semantics, default worktrees-only, and a Phase-2 preview of the "PR exists" switch | open | open |
| branch-lamp.stories.tsx | The six-state branch indicator + tooltips, including the two NEW purple variants (dim-steady for remote-only, flashing for remote-ahead) on top of the reused blue/green/yellow/red `StatusLight` | open | open |
| plug-states.stories.tsx | The per-branch plug — the existing session states for worktree branches plus the NEW dashed (no-worktree) state and the create→launch progress (creating → launching → running), with an interactive flow | open | open |
| home-panel.stories.tsx | The reframed home: the control panel over repository sections that list filtered branch rows; live re-filtering, default (worktrees-only) vs all-filters-on | open | open |
