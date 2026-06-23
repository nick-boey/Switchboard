# Documentation migration: repo-clone-browse

Ledger of where this change's planning documentation graduates to and what permanent
documentation the change must author. Every row MUST reach `resolved` before archive; every
Plans page linked in `plan.md` MUST have a row.

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| `docs/plans/switchboard/mvp.md` — the programme page (linked in `plan.md`; lists this change in its `openspec-changes` frontmatter) | — (page persists for the still-active sibling changes `worktree-management`, `claude-session-launch`, `runtime-cli-docker`) | `retire — trim` at archive: drop the `repo-clone-browse` entry from the `openspec-changes` frontmatter and trim prose specific to this change. The change-specific open questions (pagination/rate-limit, re-clone/fetch-update, partial-clone recovery) were resolved in this change's `design.md`, not on the programme page; no cross-cutting decision changed, so the page's locked decisions carry over unchanged for the siblings | open |
| `plan.md` "Planned architecture" — the committed overlay for this change (realizes the base model's `#planned` `Switchboard.Api -> GitHub`) | `docs/dev/Architecture/Planned/repo-clone-browse.c4` | `author → docs/dev/Architecture/Planned/repo-clone-browse.c4`: a new LikeC4 overlay authored during implementation — `extend` `Switchboard.Api` with the GitHub service, Git service, operation ledger/lock, and credential helper, every addition tagged `#todo`, view ids prefixed `repo-clone-browse-*`, validated with `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`. The Architecture review checkpoint fires when it lands | open |

No `docs/user` page is authored by this change: the GitHub PAT and credential-helper config are
written to `~/.switchboard` out-of-band, and config-bootstrap user documentation lands with the
CLI in `runtime-cli-docker`. The credential-helper / no-leak design is documented in `design.md`
and proven by the spec's no-leak scenarios (in-code/tests, not a `docs/dev` prose page).
