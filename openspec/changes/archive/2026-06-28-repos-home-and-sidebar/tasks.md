## 1. Test infrastructure

- [x] 1.1 Pin the harness for the deep-link mount-then-scroll assertion to the **Storybook
      test-runner browser tier** (not Vitest): the web Vitest env is `node` +
      `renderToStaticMarkup` (no DOM, no setup file), so no Vitest `scrollIntoView` stub is
      added. The interaction play test (5.1) installs its own in-browser spy via
      `spyOn(Element.prototype, 'scrollIntoView')` from `storybook/test`, where the method is
      native — confirm `storybook/test` exposes `spyOn` and document this as the single harness
      so the spy and the assertion live in one runtime.

## 2. Repositories grouping + anchor helpers (pure)

- [x] 2.1 (red) Write a failing unit test in `src/repos` (`repos/group-repos.test.ts`, the
      `repo-selection.test.ts` pattern) for: (a) `groupReposByOrg` — groups `RepoTarget[]` by
      owner, orders organisations then repositories case-insensitively, handles single-org,
      multi-org, and empty input; and (b) `repoAnchorId` — produces a **collision-proof** id,
      asserting distinct ids for the collision-prone pair `a-b/c` vs `a/b-c`.
- [x] 2.2 (green) Implement `groupReposByOrg(repos): { owner; repos }[]` and a collision-proof
      `repoAnchorId(target)` (segments separated by `/`, e.g. `repo:<owner>/<repo>`; looked up
      via `getElementById`) in `src/repos` to pass 2.1.

## 3. Repositories home page (aggregated, worktrees inline)

- [x] 3.1 (red) Add production Storybook stories for the presentational `ReposHomeView`
      (`repos/ReposHome.stories.tsx`) with static fixtures + `schemeTest`/`VIEWPORTS`
      (Populated, Empty, Loading, Error, Desktop, Dark), and a failing `composeStories` +
      `renderToStaticMarkup` test asserting: every repo present and grouped in
      organisation-then-repo order, the collision-proof `repoAnchorId` per section, an inline
      worktree slot per section, the empty-state clone call-to-action, and the two degraded
      states — the Loading story shows a loading affordance and **not** the empty CTA, and the
      Error story shows a retryable error message **distinct** from the empty state (it does not
      read as "no repositories cloned").
- [x] 3.2 (green) Implement the presentational `ReposHomeView` in `src/repos` (org headings,
      anchored sections keyed by `repoAnchorId` with `scroll-margin-top`, empty
      "Clone a repository" CTA that invokes an `onNewRepository` prop), porting the layout
      from the `repos-home-and-sidebar` prototype. Drive the rendered state from an explicit
      list-status prop (`loading | error | ready`): `loading` → loading affordance, `error` →
      error message + a retry control that invokes an `onRetry` prop, `ready` with zero repos →
      empty CTA, `ready` with repos → the grouped sections. Pass 3.1.
- [x] 3.3 (green) Implement the `ReposHome` container in `src/repos`: read the shared
      `['cloned-repos']` query, map its `isLoading`/`isError`/`refetch` to `ReposHomeView`'s
      list-status and `onRetry` props (so a failed query renders the error state, never the
      empty CTA), call `groupReposByOrg`, and render `ReposHomeView` wiring the existing
      `<Worktrees repoId>` container into each repository section.

## 4. Sidebar per-organisation navigation

- [x] 4.1 (red) Add production stories for the presentational `ReposNav`
      (`repos/ReposNav.stories.tsx`) and a failing `composeStories` + `renderToStaticMarkup`
      test asserting: one subheading per organisation with one button per repository in the
      shared order; the empty state (no groups) shows only the "New repository" action with no
      organisation subheadings or repository buttons; and the "New repository" action renders at
      the bottom of the rail. `ReposNav` is groups-driven (resolved-list groups only); the
      loading/failed → empty-rail collapse is enforced where `AppShell` passes empty groups in
      those states, and is asserted at the AppShell layer (5.x).
- [x] 4.2 (green) Implement `ReposNav` in `src/repos` (per-org grouped repo deep-link
      buttons + bottom "New repository" action), porting from the prototype. Always render the
      "New repository" action; render repository buttons only from the supplied (resolved-list)
      groups, so empty groups show only "New repository". Pass 4.1.

## 5. Wire into AppShell, deep-link scroll, and removals

- [x] 5.1 (red) Write failing interaction tests (Storybook test-runner play; the play function
      installs its own in-browser spy via `spyOn(Element.prototype, 'scrollIntoView')` from
      `storybook/test`, per 1.1 — no Vitest stub): (a) activating a sidebar repo link makes the
      home view active and scrolls that repository's section into view — including when
      activated from the new-repository view (mount-then-scroll), asserting the spy fired for
      the target section's element; and (b) on the zero-repo home, activating the
      "Clone a repository" CTA moves the app to the `new-repo` view.
- [x] 5.2 (red) Update `AppShell.test.tsx` to the new chrome: assert the persistent header
      and nav rail, that the home region renders the repositories home and the navbar renders
      `ReposNav`, and that **no** `data-testid="line-status"` card is present.
- [x] 5.3 (green) Update `AppShell`: render `ReposNav` in the navbar and `ReposHome` in the
      `home` region (both off the shared `['cloned-repos']` query); supply `ReposNav` with repo
      buttons only from a resolved list (a loading or failed query yields the "New
      repository"-only rail); pass one `onNewRepository` callback to both the sidebar "New
      repository" action and the empty-home CTA (both set `view = 'new-repo'`); add
      `pendingScrollRepoId` state + a mount-then-scroll effect; collapse `view` to
      `'home' | 'new-repo'`; remove the "Worktrees" nav entry; and delete the `lineStatus` query
      and the Line status card. Pass 5.1 and 5.2.
- [x] 5.4 (green/refactor) Remove the now-dead master-detail flow: retire `WorktreesHub`'s
      repo-selection step and any orphaned imports, leaving `Worktrees` / `WorktreesView`
      intact and used by `ReposHome`. Update `AppShell.stories.tsx` so its composed story no
      longer depends on the removed card/flow.

## 6. End-to-end

- [x] 6.1 (red) Add a failing Playwright E2E (existing temp-git fixture): with repositories
      cloned across organisations, the home page shows them all grouped on one page with
      worktrees inline, and activating a sidebar repo link reveals that repository's section;
      and with no repositories cloned, the home's "Clone a repository" CTA opens the
      new-repository flow.
- [x] 6.2 (green) Make 6.1 pass (adjust wiring/`data-testid`s as needed; no new backend).

## 7. Prototype reconciliation & verification

- [x] 7.1 Resolve the `prototypes.md` ledger row for `home-and-sidebar.stories.tsx` to
      `delete — subsumed by the shipped ReposHomeView / ReposNav production stories` (status
      `resolved`); the archive performs the `git rm`.
- [x] 7.2 Run `just typecheck`, `just lint`, `just test`, and (after `just build`) `just e2e`;
      confirm all green.

## 8. Post-clone list refresh (implementation-review remedy)

- [x] 8.1 (red) Add a failing Playwright E2E (the `repo-clone` project's fake-GitHub + `insteadOf`
      harness): from a fresh, empty workspace, activate the home's "Clone a repository" CTA, complete
      a clone, and assert the newly cloned repository appears in the sidebar (and its home section is
      reachable) **without a page reload** — the regression Codex flagged (the always-mounted
      `['cloned-repos']` query stayed on the stale empty list after a clone).
- [x] 8.2 (green) Invalidate the shared `['cloned-repos']` query when a clone reaches `ready` (in the
      `GettingReady` container), so the home and sidebar refresh without a reload. Pass 8.1. Re-run
      `just typecheck` / `just lint` / `just test` / `just e2e`.
