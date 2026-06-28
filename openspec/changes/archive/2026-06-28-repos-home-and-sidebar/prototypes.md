# Prototypes: repos-home-and-sidebar

Ledger for the UI prototypes of this change. One row per `*.stories.tsx` file under
`src/prototypes/repos-home-and-sidebar/`. The filesystem is authoritative:
every prototype file on disk MUST have exactly one row, and there MUST be no rows for
files that no longer exist. Archiving is blocked while any row is `open` or any file on
disk is unlisted.

<!--
Disposition vocabulary (exactly one per row):
  promote → <target path>   The story file is directly reusable as a real story;
                            the archive does a mechanical `git mv` + retitle to the
                            target's path projection + drops `definePrototypeMeta`.
                            Use ONLY when no code adaptation is needed.
  delete — <reason>         The sketch is subsumed by the shipped implementation, or
                            abandoned. The archive does `git rm`.
Porting prototype CODE into a production location is implementation work — put it in
tasks.md, never here.

Status: open (undecided) | resolved (disposition agreed).
-->

| Story file | Explores | Disposition | Status |
| --- | --- | --- | --- |
| home-and-sidebar.stories.tsx | Single aggregated home page (all repos grouped by organisation, sorted org-then-repo, worktrees inline, anchored sections) + rebuilt per-organisation sidebar with deep-linking repo buttons; Populated and Empty states | delete — subsumed by the shipped `ReposHomeView` / `ReposNav` production stories | resolved |
