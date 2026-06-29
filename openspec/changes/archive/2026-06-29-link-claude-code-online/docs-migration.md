# Documentation migration: link-claude-code-online

Ledger of where this change's planning documentation graduates to and what permanent documentation
the change must author. Every row MUST reach `resolved` before archive; every Plans page linked in
plan.md MUST have a row.

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| `docs/dev/Architecture/Planned/link-claude-code-online.c4` — the planned overlay (the `sessionLinkResolver` component + the `sessionService → sessionLinkResolver`, `sessionLinkResolver → TmuxHost`, and `WebSPA → ClaudeBackplane` edges, all `#todo`) | `docs/dev/Architecture/model.c4` + `docs/dev/Architecture/views.c4` | `merge → docs/dev/Architecture/{model.c4,views.c4}`: **DONE in task 6.1** — graduated the overlay (stripped every `#todo`, folded the `sessionLinkResolver` component + its three edges into `model.c4` and the two `link-claude-code-online-*` views into `views.c4`, deleted the Planned file, `likec4 validate` → ✓ Valid). The component description carries the **permanent** record of the `~/.claude/sessions/<pid>.json` dependency + degradation contract | resolved |
| `plan.md` Decisions — the seed "author a sessions-slice dev doc for the internal-file dependency" | — | `discard — superseded by design`: following the `worktree-management` precedent (no `docs/dev` prose page for facts captured in design + specs + code), the fragile-dependency + degradation knowledge lives **permanently** in (a) the graduated LikeC4 `sessionLinkResolver` component description, (b) the `session-link-resolver.ts` module header comment, and (c) the `session-web-link` spec (the bounded/observable-degradation requirement). No separate prose page is authored | resolved |

No `docs/user` page is authored: the "open in Claude web" affordance is surfaced through the web UI
(the worktrees hub) and is self-explanatory; the deep-link behaviour is proven by the
`session-web-link` spec scenarios (in-code/tests, not a `docs/user` prose page).

No Plans page is linked in `plan.md` (it is the complete plan), so there is no `retire` row.

The prototype-disposition for `apps/web/src/prototypes/link-claude-code-online/claude-web-link.stories.tsx`
(promoted into a production story during implementation) is tracked in this change's `prototypes.md`
ledger and reconciled by the archive skill, not here.
