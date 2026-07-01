## 1. Test infrastructure

- [x] 1.1 Add `@tanstack/react-router` to `apps/web` `dependencies` (run `just install`); confirm it resolves under the `switchboard-source` Vitest condition.
- [x] 1.2 Build the router test harness in `apps/web/src` (design Testing strategy): a memory-history test-router factory (`createMemoryHistory({ initialEntries: [path] })` over a given route tree + a test context `{ client, liveSessions }`) and a `renderWithRouter(router)` helper that `await router.load()` **before** `renderToStaticMarkup`. Prove it with a throwaway trivial route tree — the helper renders the matched component after load, not the pending state.
- [x] 1.3 Add a Storybook router decorator (or story helper) that mounts a story inside a memory router and wires the story's `liveSessions`/injected `client` args into the route context, so shell/page stories render under routing.

## 2. Router scaffolding, root layout, and top-level pages

- [x] 2.1 (red) Write a failing test (via the harness): mounting the app router at `/` renders the `AppShell` chrome (`app-shell`, `nav-rail`/`repos-nav`, `brand-mark`) AND `ReposHome` (its repos / loading / empty state), and the "New repository" `Link` renders with `href` `/new-repo`.
- [x] 2.2 (green) Create the code-based route tree: `createRootRouteWithContext<{ client: SwitchboardClient; liveSessions: number }>()` whose component is `AppShell`; an index route `/` rendering `ReposHome` (reused as-is — no Home extraction); a route `/new-repo` rendering `ReposFlow`. Assemble with `createRouter`.
- [x] 2.3 (green) Convert `AppShell` to pure chrome (design D2/D3/D6): drop the `view` and `pendingScrollAnchor` `useState`, render `<Outlet />` in `<MantineAppShell.Main>`, read `client`/`liveSessions` from route context instead of props, and route the top-level home↔new-repo navigation through the router (keep the shared `['cloned-repos']` query feeding `ReposNav`'s groups).
- [x] 2.4 (green) In `apps/web/src/main.tsx`, create the `QueryClient` for `AppProviders` (as today) and mount `RouterProvider` with the default router context (`createSwitchboardClient()`, `liveSessions: 0`), replacing the direct `<AppShell />` render. (The router context carries only `client`/`liveSessions` — no `queryClient`, since no route runs a `beforeLoad` guard.)
- [x] 2.5 (green) Adapt `AppShell.test.tsx` and `AppShell.stories.tsx` to the layout-with-`<Outlet>` shape using the router harness/decorator (chrome + `ReposHome` assertions under a `/` render; `liveSessions` via context); keep the Mobile/Desktop/Dark scheme assertions.

## 3. Repo-anchor deep-link routing

- [x] 3.1 (red) Write failing tests (via the harness, with the `['cloned-repos']` query seeded in the test context): loading `/<owner>/<repo>` for a **currently-cloned** id renders `ReposHome`; a **malformed** or **un-cloned** id also renders `ReposHome` (no redirect, no error); the sidebar renders repo `Link`s to `/<owner>/<repo>`. (The scroll-into-view itself is asserted in group 4, not here — static markup has no scroll.)
- [x] 3.2 (green) Add the `/$owner/$repo` route: it renders the same `ReposHome` and re-sources the **mount-then-scroll** effect from the route params — derive the anchor `` `repo:${owner}/${repo}` `` and scroll once the section has mounted (guard on `getElementById`), re-running when the `['cloned-repos']` list resolves. No `beforeLoad`, no redirect, no membership check (design D4/D7).
- [x] 3.3 (green) Convert `ReposNav`: the repo buttons become typed `Link to="/$owner/$repo" params={{ owner, repo }}` and the "New repository" action a `Link to="/new-repo"`, both with active-state styling (design D6); remove `AppShell`'s `selectRepo`/`pendingScrollAnchor` click path — the URL now drives the scroll.

## 4. Browser-level navigation and deep-link verification

- [x] 4.1 (red→green) Add Storybook test-runner play function(s) for the **in-app** outcomes only — the decorator's router is memory-history, which does not drive `window.history` or the address bar (design Testing strategy): clicking the "New repository" `Link` swaps the main content; clicking a sidebar repo `Link` scrolls that repository's section into view and marks it active in the nav. Do **not** assert the address bar or browser Back/Forward here — those belong to Playwright (4.2).
- [x] 4.2 Add a Playwright E2E spec (the **sole** owner of real browser-history assertions) asserting: the **address bar** updates on navigation; the **browser Back/Forward** buttons move between pages (incl. repository A → repository B → Back → Forward, which must move the URL **and** the scrolled section between the two anchors — covers the `web-navigation` "Back and Forward move between repository anchors" scenario / design D7); and that a deep-linked `/new-repo` and a cloned repo's `/<owner>/<repo>` load directly, scroll the repository section into view, **and survive a reload** (exercises the clean-path / Vite history-fallback behaviour). Confirm existing `app-shell.spec.ts` and the worktree spec still pass.

## 5. Documentation

- [x] 5.1 Add a "Routing" section to `apps/web/CLAUDE.md` (docs-migration `merge →` row): where the code-based route tree lives, the URL scheme (incl. the `/<owner>/<repo>` repo-anchor sub-path that scrolls the home), clean browser-history paths, and the production `index.html` history-fallback requirement (the `runtime-cli-docker` constraint). Mark the docs-migration row `resolved`.

<!-- Codex Implementation review (2026-06-28) — both findings addressed in-stage:
     [high] deep-link scroll raced layout growth → `useRepoAnchorScroll` now re-pins the target via a
       MutationObserver for a bounded settling window (bails on user scroll); regression covered by
       `e2e/page-routing.spec.ts` "stays scrolled … as preceding sections grow".
     [medium] active-nav requirement was marked but not visible/tested → `ReposNav` applies visible
       active styling (D6) and active state is asserted in `routes.test.tsx` (unit) + the E2E. -->

## 6. Verification

- [x] 6.1 Run `just lint`, `just typecheck`, and `just test` green; then `just build` and `just e2e` green. Manually confirm in `just run` that navigating changes the URL, Back/Forward work, and a reloaded repo deep link (`/<owner>/<repo>`) scrolls the repository's section into view. _(All green: typecheck + lint clean; `just test` 459/459; `just build` ok; `just e2e` 31/31. The manual `just run` checks are covered end-to-end by `e2e/page-routing.spec.ts` — URL updates, Back/Forward incl. between repo anchors, and reloaded deep-link scroll.)_
- [ ] 6.2 **Archive gate (production SPA fallback, see `dependencies.md`):** before archiving, confirm the production SPA host returns `index.html` as a history fallback for unknown non-`/api` paths and that it is verified there — otherwise deep-linked/reloaded clean paths 404 in production even though they pass under Vite. This obligation is owned by **`serve-web-spa`** (production static serving + history fallback, with its own verification), captured by the `depends-on: [serve-web-spa]` edge in `dependencies.md`. Do not archive page-routing until `serve-web-spa` is archived — the single, mechanical archive condition; its discharge is verified by serve-web-spa's own production-fallback tasks, not re-verified here.
