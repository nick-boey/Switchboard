# Documentation migration: ui-prototypes-mvp

Ledger of where this change's planning documentation graduates to and what permanent
documentation the change must author. Every row MUST reach `resolved` before archive; every
Plans page linked in `plan.md` MUST have a row.

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| `docs/plans/switchboard/mvp.md` — the programme page (linked in `plan.md`; lists this change in its `openspec-changes` frontmatter) | — (page persists for the active sibling changes) | `retire — trim` at archive. **Current-decision propagation done by this change** (not deferred): the gate outcomes — worktrees-hub IA, plug-as-session, no launch toast, display-only lamps, and the **Future features → git/GitHub indicator-lamp helpers** deferral — are already merged into the page (roadmap row #2 + Future features). At archive, drop the `ui-prototypes-mvp` entry from the `openspec-changes` frontmatter and trim prototyping prose specific to this change; the cross-cutting content stays for the still-active siblings | resolved |
| Design-language reference (flat treatment, palette/type tokens, primitives + their states) | Storybook gallery — production stories under `apps/web/src/**` + `theme/theme.ts` (in-code; authored as `tasks.md` implementation, not a `docs/` page) | `discard — no prose page`: per `plan.md` Decision 8 the design language is documented as the **living Storybook gallery**, not a `docs/dev` page; it graduates as production stories during implementation, so there is no documentation page to migrate | resolved |

No `docs/dev` or `docs/user` prose page is authored by this change: it has **no architectural
impact** (no `docs/dev/Architecture` content) and the design system is documented in-code via
Storybook. The only durable doc movement is the programme-page trim at archive.
