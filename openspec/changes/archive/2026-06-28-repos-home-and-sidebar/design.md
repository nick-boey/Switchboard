## Context

Today the home view (`AppShell`, `view === 'home'`) renders only a diagnostic "Line
status" card, and cloned repositories are reachable only behind the sidebar's "Worktrees"
button via `WorktreesHub` — a master-detail flow that shows one repository's worktrees at a
time (`Worktrees`/`WorktreesView`). The data needed for an aggregated view already flows:
`repos.cloned` returns `RepoTarget[]` (`{ owner, repo }`, owner = organisation) and
`worktrees/:owner/:repo` returns a repository's worktrees. Navigation is `useState`-based
(`'home' | 'new-repo' | 'worktrees'`); `apps/web` has no router dependency.

The prototype (`src/prototypes/repos-home-and-sidebar/home-and-sidebar.stories.tsx`,
Populated + Empty, verified light/dark) confirmed the target: one organisation-grouped page
with worktrees inline and anchored sections, a sidebar of per-organisation repo deep-links,
and the two empty states — with "New repository" pinned to the bottom of the rail.

## Goals / Non-Goals

**Goals:**

- A single home page listing every cloned repository across all organisations, grouped by
  organisation and sorted org-then-repo alphabetically (case-insensitive), with each
  repository's worktrees shown inline.
- A sidebar that lists one deep-linking button per repository under a per-organisation
  subheading, sharing the page's grouping/sort; activating a button navigates to home and
  scrolls the repository's section into view.
- Both empty states; removal of the master-detail Worktrees flow and the Line status card.

**Non-Goals:**

- No `apps/server`, `packages/shared`, or contract changes; no new dependency (no router).
- No change to worktree create/list/delete, session-launch, or clone behaviour — those
  containers are reused as-is.
- No sidebar density/scaling treatment for very large repo/org counts (deferred).

## Decisions

- **Reuse the `Worktrees` container per repository section (inline).** The aggregated home
  renders the existing `<Worktrees repoId>` container once per repository, so the
  per-worktree session plug, create modal, and delete-confirm wiring is preserved verbatim.
  Many repos → many parallel `['worktrees', repoId]` queries; TanStack Query parallelises
  and caches them. _Prototype note:_ the prototype stood in a presentational row sketch
  because the workbench cannot resolve the container's runtime `@switchboard/shared` import;
  production renders the real container.
- **Presentational view + container split (matches the repo's story-tested pattern).**
  - `groupReposByOrg(repos): { owner, repos }[]` — a pure helper in `src/repos`, the single
    source of grouping/sort, consumed by both surfaces so they never diverge.
  - `ReposHomeView` (presentational) — takes the grouped targets plus an explicit list status
    (`loading | error | ready`) and an `onRetry` callback, and renders org headings, each
    repository as an anchored section, and — for an unresolved/failed/empty list — a loading
    affordance, a retryable error message (distinct from empty), or the empty CTA respectively;
    delegates each section's worktree subtree to a child/render-prop. Keeping the status a prop
    (rather than fetching) lets the loading and error states be story-tested as static fixtures
    alongside structure, ordering, anchors, and the empty state.
  - `ReposHome` (container) — reads `['cloned-repos']`, maps the query's
    `isLoading`/`isError`/`refetch` to `ReposHomeView`'s status/`onRetry` props, calls
    `groupReposByOrg`, and renders `ReposHomeView` wiring `<Worktrees repoId>` into each
    section. Data wiring covered by E2E; the loading/error rendering covered by the view stories.
  - `ReposNav` (presentational) — the sidebar's grouped repo links + bottom "New repository"
    action; `AppShell` supplies the shared `['cloned-repos']` query and the nav callbacks. The
    "New repository" action is always rendered; repository buttons render only from a resolved
    list, so a loading or failed list shows the same rail as the empty state (only "New
    repository").
- **Anchors via DOM fragment ids + `scrollIntoView`, no router.** Each section gets a stable,
  **collision-proof** id and `scroll-margin-top` to clear the sticky header. A naïve
  `repo-<owner>-<repo>` collides because the owner/repo charset permits `-`, `_`, and `.`
  (so `a-b/c` and `a/b-c` would share an id). Instead the id keeps the segments unambiguously
  separated by `/` — which neither segment can contain — e.g. `repo:<owner>/<repo>` (the
  canonical `repoId` prefixed). Lookups use `getElementById` (not a CSS selector), so the
  `:`/`/` characters need no escaping; `repoAnchorId(target)` is a small pure function paired
  with `groupReposByOrg`.
- **Mount-then-scroll for cross-view activation.** `AppShell` holds the `view` state and a
  `pendingScrollRepoId`. A sidebar repo click sets `view = 'home'` and the pending id; an
  effect runs after the home (and the target section) has mounted and scrolls it into view,
  then clears the pending id. This is the agreed handling for activating a link from a
  non-home view (prototype confirmed the approach).
- **Both new-repository entry points wire to the `new-repo` view.** `AppShell` passes a single
  `onNewRepository` callback to both the sidebar's bottom "New repository" action and the
  empty-home "Clone a repository" CTA; activating either sets `view = 'new-repo'`. The empty
  CTA's _behaviour_ (not just its presence) is asserted by an interaction test and the E2E,
  so an inert button cannot pass — the empty home must actually open the clone flow.
- **Shared `['cloned-repos']` query key** across the sidebar and the home, so the list is
  fetched once and the two surfaces stay consistent. Because `AppShell` now keeps this query
  mounted continuously (rather than the old mount-on-demand `WorktreesHub`), a completed clone
  no longer triggers an incidental refetch; the clone flow therefore **invalidates
  `['cloned-repos']` when a clone reaches `ready`** (in the `GettingReady` container) so a
  newly cloned repository appears in the home and sidebar without a reload.
- **Retire the master-detail Worktrees flow and the Line status card.** `WorktreesHub`'s
  selection step and the "Worktrees" nav entry are removed (its inline worktree rendering
  lives on per repo); the `lineStatus` query and card are deleted (the SPA stops calling the
  placeholder `echo` route from this surface; the header live-session count is unaffected).
  The `view` state collapses to `'home' | 'new-repo'`.

## Testing strategy

**Intended surface:**

- **Unit (Vitest):** `groupReposByOrg` — grouping, organisation-then-repository
  case-insensitive ordering, single-org, multi-org, and empty input; and `repoAnchorId` —
  distinct ids for collision-prone pairs (`a-b/c` vs `a/b-c`). Follows the existing
  `repos/repo-selection.test.ts` pure-function pattern.
- **Component (composed stories → static markup):** production Storybook stories for
  `ReposHomeView` and `ReposNav` with static fixtures, asserted via `composeStories` +
  `renderToStaticMarkup` (the `AppShell.test.tsx` pattern): all repos present and grouped in
  order, anchored section ids present, worktrees inline, empty home CTA, empty sidebar shows
  only "New repository", and the action sits at the bottom of the rail. The home's three list
  states are covered as separate fixtures — a Loading story (loading affordance, no empty CTA),
  an Error story (retryable error message distinct from the empty state), and the empty/populated
  stories — and the sidebar stays on "New repository"-only for the loading/error/empty fixtures.
  Light/dark + mobile/desktop coverage via the `schemeTest`/`VIEWPORTS` story parameters.
- **Interaction (Storybook test-runner / play):** activating a sidebar repo link sets the
  home view and scrolls the section into view, including from a non-home view
  (mount-then-scroll); and activating the empty-home "Clone a repository" CTA moves to the
  `new-repo` view. Responsive drawer↔rail and dark resolution via Mobile/Desktop/Dark stories.
- **E2E (Playwright):** a happy-path over the real `ReposHome` container — clone-seeded repos
  render grouped on one page with worktrees inline, a sidebar link reveals a section, and the
  zero-repo home's clone CTA opens the new-repository flow — using the existing temp-git
  fixture.

**Harness gap assessment:** the harness exists (Vitest + `composeStories` +
`renderToStaticMarkup` + Storybook test-runner + `schemeTest`/`VIEWPORTS` + the Playwright
temp-git fixture); no new harness is required. Modifications needed first (the leading
"Test infrastructure" task group):

1. **Update `AppShell.stories.tsx` + `AppShell.test.tsx`** to the new home: drop the
   `data-testid="line-status"` assertion and the card, and re-scope the AppShell unit test to
   the persistent chrome (header, nav rail) — the populated-home assertions move to the
   `ReposHomeView`/`ReposNav` stories so they need no fetching client.
2. **The mount-then-scroll assertion runs in the Storybook test-runner browser tier, not
   Vitest.** The web Vitest env is `node` + `renderToStaticMarkup` (no DOM, no setup file), so a
   Vitest-process `scrollIntoView` stub would be both unnecessary and invisible to the play
   test. Instead the interaction play function installs its own spy in-browser
   (`spyOn(Element.prototype, 'scrollIntoView')` from `storybook/test`, where the method is
   natively present) and asserts the target section was scrolled. One harness, end to end — no
   cross-runtime spy hand-off.
3. **Confirm no container-level fake client is needed** — the presentational-first split
   keeps fetching out of the component tests; only the E2E exercises the container, via the
   existing temp-git fixture.

## Risks / Trade-offs

- **[Many parallel per-repo worktree queries on one page]** → Reuse of the `Worktrees`
  container means one `['worktrees', repoId]` (+ liveness) query per repo. Acceptable at
  expected cloned-repo counts; TanStack Query caches and dedupes. Revisit only if repo counts
  grow large (out of scope here, tracked with the deferred sidebar-density work).
- **[Mount-then-scroll timing]** → Scrolling before the target section exists would no-op.
  Mitigation: drive the scroll from an effect keyed on the pending repo id that runs after the
  home mounts (and guard on the element being present), rather than scrolling synchronously on
  click.
- **[Stacked worktree loading/error states]** → Several repos loading/erroring at once could
  read noisily. Mitigation: the existing per-repo `WorktreesView` states are compact; verify
  they read well stacked (the one open prototype check) and adjust spacing only if needed.
- **[Removing the Line status card]** → It was the SPA's only `echo` consumer and an
  AppShell-test assertion. Mitigation: delete the query/card and update the test in the same
  task group; the `echo` route itself is untouched.

## Open Questions

- None blocking. The single prototype-stage visual check (stacked per-repo worktree states)
  is resolved during implementation when the real `Worktrees` containers render together.
