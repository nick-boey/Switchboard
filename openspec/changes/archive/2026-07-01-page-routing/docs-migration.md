# Documentation migration: page-routing

Ledger of where this change's planning documentation graduates to and what permanent
documentation the change must author. Every row MUST reach `resolved` before archive;
every Plans page linked in plan.md MUST have a row.

| Source | Destination | Action | Status |
| --- | --- | --- | --- |
| plan.md / design.md routing decisions (router choice, route table, clean-path + prod `index.html`-fallback constraint) | `apps/web/CLAUDE.md` | merge → `apps/web/CLAUDE.md` (add a "Routing" section: where the code-based route tree lives, the URL scheme incl. the `/<owner>/<repo>` repo-anchor sub-path, clean browser-history paths, and the prod history-fallback requirement) | resolved |

No `docs/plans` page is linked in plan.md (single, web-only change), so there are no plan-page
retire/trim rows. The OpenSpec artifacts themselves (plan.md, design.md, specs) archive with
the change and are not permanent-docs destinations.
