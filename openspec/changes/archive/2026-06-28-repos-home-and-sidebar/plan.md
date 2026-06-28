# Plan: repos-home-and-sidebar

<!-- Created during the planning interview (/switch-plan). The durable record of why this
     change exists and what architectural shape was agreed. -->

## Problem

Today the web app shows **one repository per page**. Cloned repos are reachable only
behind the sidebar's **Worktrees** button, which opens `WorktreesHub` — a master-detail
flow where you pick a single repo and then see *that* repo's worktrees. The actual home
view (`AppShell.Main` with `view === 'home'`) shows nothing but a diagnostic "Line
status" card. There is no single place to see everything you have cloned, and the
sidebar offers no per-repository navigation.

The user wants a single **home page** that lists **all repositories across all
organisations**, sorted by organisation then repository (alphabetical), with **each
repository's worktrees shown inline** on that one page. The **sidebar** should list one
button per repository, grouped under a per-organisation subheading; clicking a button
navigates to the home page and scrolls to that repository's section.

## Architecture summary

This is a presentation / information-architecture change confined to the
`Switchboard.WebSPA` container. The data it needs already flows: the cloned-repos list
(`repos.cloned` → `Switchboard.Api.gitService`) and per-repo worktrees
(`worktrees/:owner/:repo` → `Switchboard.Api.worktreeService`). No server
(`apps/server`), shared contract (`packages/shared`), or LikeC4 model change is
required — the SPA is modelled as a single opaque container, so a screen/navigation
restructure is below the architectural granularity.

Two SPA surfaces change:

1. **Home page becomes the repositories hub.** A new presentational composition
   (in the `apps/web/src/repos` slice) reads the existing `['cloned-repos']` query,
   groups the repos by organisation (owner) and sorts org-then-repo alphabetically, and
   renders each repository as a section with a stable anchor id. Each section reuses the
   existing self-contained `Worktrees` container (`repoId`) so the per-worktree session
   plug, create-modal, and delete-confirm wiring is preserved unchanged — the worktrees
   render **inline**, one block per repo, instead of behind a selection. The
   master-detail `WorktreesHub` selection step and its "Worktrees" nav entry are
   retired; their composition collapses into this single page.

2. **Sidebar lists repositories grouped by organisation.** `AppShell`'s navbar reads the
   same `['cloned-repos']` query (shared by query key — no new fetch), renders a
   subheading per organisation and one button per repository under it (same grouping/sort
   as the page). Activating a repo button ensures the home view is active and scrolls the
   matching repo section into view via its anchor id. The existing "New repository"
   action is kept as a distinct top-level nav entry.

Because navigation is `useState`-based (no router dependency in `apps/web`), anchoring is
done with DOM fragment ids (`scroll-margin-top` to clear the sticky header) plus a
programmatic `scrollIntoView`, not URL routes.

This change is `switch-feature-ui`: the aggregated page layout and the restructured
sidebar are a visibly new composition, so they are sketched as quarantined Storybook
prototypes (the `prototypes.md` ledger) before the design decisions are fixed, then
promoted into the slice.

## Plan page

None — this plan.md is the complete plan. The change is a single, self-contained SPA
restructure with no sibling changes sharing its capability (the one other active change,
`runtime-cli-docker`, touches only `api-auth-gate` / `app-runtime` / `cli-runtime` /
`container-runtime`).

## Planned architecture

None — no architectural impact. `Switchboard.WebSPA` is modelled as a single container
with no sub-components; this change reorganises screens and navigation inside it and adds
no container, component, relationship, or external dependency. (Consequently the
Architecture review checkpoint does not apply to this change.)

## Decisions

- **Reuse the existing `Worktrees` container per repo section** rather than building a new
  aggregated worktrees fetch. Each repo block renders `<Worktrees repoId>` as-is, keeping
  the session-launch / create / delete behaviour intact. Many repos → many parallel
  `['worktrees', repoId]` queries; TanStack Query parallelises and caches them, which is
  acceptable for the expected number of cloned repos.
- **Grouping/sorting is a pure, unit-tested helper** in the `repos` slice
  (e.g. `groupReposByOrg(repos) → [{ owner, repos }]`), consumed by **both** the home page
  and the sidebar so they never diverge. Sort organisations alphabetically, then repos
  alphabetically within each (case-insensitive / locale-aware).
- **Anchors via DOM fragment ids, no router.** Each repo section gets a stable, path-safe
  id derived from `<owner>/<repo>`. Sidebar activation sets `view = 'home'` then scrolls
  the section into view; `scroll-margin-top` offsets the sticky header. No router
  dependency is added.
- **Shared `['cloned-repos']` query.** The sidebar and the home page both read the same
  query key, so the repo list is fetched once and stays consistent across the two
  surfaces.
- **Retire the master-detail Worktrees view.** Per the scope decision (worktrees inline),
  `WorktreesHub`'s repo-selection step and the "Worktrees" sidebar entry are removed; the
  remaining nav actions are the per-repo links plus "New repository".
- **Keep "New repository" in the sidebar** as a distinct top-level action — the request
  adds per-repo navigation, it does not remove the clone entry point.
- **Remove the "Line status" card entirely** — it is not shown anywhere after this
  change. The home view no longer round-trips the placeholder `echo` health check; the
  `lineStatus` query and its card are deleted (the header's live-session count is
  unaffected).
- **Mount-then-scroll for cross-view anchors** (confirmed): activating a repo link from
  another view sets `view = 'home'` and scrolls the section into view once it has
  mounted (effect keyed on a pending-scroll target, or `requestAnimationFrame`).
- **Empty states:**
  - *Empty sidebar* — when no repos are cloned, the sidebar shows **only** the
    "New repository" button (no organisation subheadings, no repo list).
  - *Empty home page* — shows a short message about cloning a repository and a
    **"Clone a repository" button** that opens the New repository flow.
- **Keep the current sidebar density** for now; richer treatment for many repos/orgs is
  deferred to a later exploration.
- **Documentation destinations (seed for the ledger):** author/refresh the web UI surface
  notes under `docs/dev/` describing the repositories-home + sidebar navigation IA
  (replacing any description of the master-detail hub). No user-facing docs page is
  implicated by an internal navigation restructure. No Plans page to retire (none
  created). These become the initial `docs-migration.md` rows after design.

## Open questions

- **Stacked per-repo worktree states.** Per-repo worktree loading/error states already
  exist in `WorktreesView`; confirm they read well when several render stacked on one
  page (a visual check for the prototype, not a scope question).
