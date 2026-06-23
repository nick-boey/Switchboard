# Documentation migration: worktree-management

Ledger of where this change's planning documentation graduates to and what permanent
documentation the change must author. Every row MUST reach `resolved` before archive; every
Plans page linked in `plan.md` MUST have a row.

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| `docs/plans/switchboard/mvp.md` — the programme page (linked in `plan.md`; lists this change in its `openspec-changes` frontmatter) | — (page persists for the still-active sibling changes `claude-session-launch`, `runtime-cli-docker`) | `retire — trim` at archive: drop the `worktree-management` entry from the `openspec-changes` frontmatter and trim prose specific to this change. The **canonical path-safe ID scheme** is a cross-cutting decision reused by `claude-session-launch` (tmux session names); the page keeps its "direction" record of that scheme unchanged, while the full design now lives in this change's `design.md`/spec — no shared decision is altered, so the page's locked decisions carry over for the siblings | open |
| `plan.md` "Planned architecture" — the deferred overlay scaffold for this change (extends `Switchboard.Api`'s Git service with worktree concerns) | `docs/dev/Architecture/Planned/worktree-management.c4` | `author → docs/dev/Architecture/Planned/worktree-management.c4`: a new LikeC4 overlay authored during implementation — `extend` `Switchboard.Api` (its Git service) with the worktree create/list/delete operations and the worktree-typed operation ledger usage, every addition tagged `#todo`, view ids prefixed `worktree-management-*`, validated with `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`. The Architecture review checkpoint fires when it lands | resolved |

No `docs/user` page is authored by this change: worktree creation/listing/deletion is surfaced
through the web UI (the worktrees hub), and config-bootstrap/user documentation lands with the CLI
in `runtime-cli-docker`. The canonical ID scheme and the safe-to-delete predicate are documented
in `design.md` and proven by the spec's scenarios (in-code/tests, not a `docs/dev` prose page).

The prototype-disposition for `apps/web/src/prototypes/ui-prototypes-mvp/worktrees.stories.tsx`
(this change consumes its worktree-list / create / delete slice into production UI) is tracked in
`ui-prototypes-mvp`'s `prototypes.md` ledger and reconciled by the archive skill, not here.
