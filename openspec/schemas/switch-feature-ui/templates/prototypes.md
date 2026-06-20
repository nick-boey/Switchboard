# Prototypes: {{change-name}}

Ledger for the UI prototypes of this change. One row per `*.stories.tsx` file under
`src/prototypes/{{change-name}}/`. The filesystem is authoritative:
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
