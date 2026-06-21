# Plan: prototype-storybook-harness

> Stage-1 planning record for the prototype-viewing Storybook harness — the enabling
> infrastructure that makes the `switch-ui-prototype` workflow runnable. `foundations` shipped
> only the quarantine *exclusion* and deferred the viewing config to "the `switch-ui-prototype`
> workflow"; this is its first use, so the harness must be built before `ui-prototypes-mvp` can
> sketch anything.

## Problem

The `switch-ui-prototype` workflow sketches quarantined Storybook stories under
`src/prototypes/<change-name>/` and iterates on them visually (light + dark screenshots). Today
that is impossible: the production `.storybook/main.ts` **structurally excludes**
`src/prototypes/**` (it filters any path containing `prototypes`, because Storybook 10 ignores
`!` glob negations), there is **no `definePrototypeMeta` helper**, and there is **no config
that renders prototypes**. The exclusion is correct and must stay — prototypes must never reach
the production build, snapshot run, autodocs, package exports, or production bundles — but we
need a *second*, dev-only way to view them.

## Architecture summary

All work is **dev-only tooling inside the `Switchboard.WebSPA` workspace** (`apps/web`); no
production runtime code and no change to `Switchboard.Api`. Three pieces:

1. **A dedicated prototype Storybook config** — a separate config directory (e.g.
   `.storybook-prototypes/`) whose `main.ts` globs **only** `src/prototypes/**/*.stories.@(ts|tsx)`
   and reuses the existing `preview.tsx` (so prototypes render through `AppProviders` + the
   retro theme). Run via a new `storybook:prototypes` package script. The production
   `.storybook/` config is left untouched and keeps excluding prototypes — so production
   exclusion is guaranteed *structurally* (the prod config never even globs the folder), not by
   a toggle that could be set wrong.
2. **`definePrototypeMeta` helper** at `src/prototypes/define-prototype-meta.ts` — a typed
   function returning a Storybook `Meta` pre-filled with the quarantine tags
   (`prototype`, `!autodocs`); spread into each story's meta literal (Storybook's static indexer
   rejects `export default definePrototypeMeta(...)` directly).
3. **A location-based indexer** in the prototype config that derives the
   `Prototypes/<change-name>/<Story>` sidebar title from the file's path and applies the
   quarantine tags — so grouping is automatic and authors don't hand-write titles.

## Plan page

[docs/plans/switchboard/mvp.md](../../../docs/plans/switchboard/mvp.md) — the programme page
drives this change (listed in its `openspec-changes` frontmatter, roadmap row **1b**). No
separate plans page is warranted.

## Planned architecture

**None — no architectural impact.** This is Storybook dev/build tooling inside `apps/web`; it
introduces no new LikeC4 element, relationship, or production code path, so there is no
`docs/dev/Architecture/Planned/prototype-storybook-harness.c4` overlay and no Architecture
review checkpoint.

## Decisions

1. **Two configs, not an env-toggle.** A separate `.storybook-prototypes/` config dir rather
   than conditionally flipping the production config's stories glob. The production config then
   *cannot* include prototypes regardless of env — the safest possible guarantee, and it matches
   foundations' note about "the dedicated config added by the `switch-ui-prototype` workflow."
2. **Reuse `preview.tsx`.** The prototype config imports the existing preview so prototypes
   render with `AppProviders` + the Mantine retro theme — identical context to production
   stories. No duplicated theming. *(Refined in `design.md`: to support dark-mode preview the
   prototype config uses its own `.storybook-prototypes/preview.tsx` supplying an
   `AppProviders colorScheme="auto"` decorator and reusing only the production `parameters` —
   `design.md` is authoritative on the preview mechanism.)*
3. **Helper lives at `src/prototypes/define-prototype-meta.ts`.** One level above the per-change
   folders (matching the skill's `../define-prototype-meta` import), shared by every change's
   prototypes. It is dev-only and excluded from production exactly like the stories.
4. **Regression guard is the point.** The headline tests assert (a) the production stories list
   excludes `src/prototypes/**`, and (b) the prototype config's list includes them — so a future
   edit can't silently leak prototypes into production or break prototype viewing.
5. **Reusable, not ui-prototypes-mvp-specific.** Built as standalone shared infrastructure so
   every later UI change's prototyping consumes it unchanged.

## Open questions

- **Indexer vs. helper overlap** — if the location-based indexer already injects title + tags,
  how much should `definePrototypeMeta` still set (belt-and-suspenders vs. minimal)? Settle in
  design.md; both must agree on the tag set.
- **Port / process** — does the prototype Storybook need a distinct port from the production
  one (e.g. `6007`) so both can run together, or is reusing `6006` fine? Minor; decide in design.
- **Snapshot scope** — confirm whether prototypes get their *own* (separate) visual-snapshot run
  later, or remain snapshot-free; for this change they stay snapshot-free (quarantined).
