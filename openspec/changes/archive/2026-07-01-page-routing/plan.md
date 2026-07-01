# Plan: page-routing

<!-- Created during the planning interview (/switch-plan). The durable record of why this
     change exists and what architectural shape was agreed. -->

> **Re-planned 2026-06-28** after the `repositories home + per-organisation sidebar`
> restructure (PR #17, commit `bddeb7e`) landed on `main`. That change **deleted** the
> master-detail `WorktreesHub` and the diagnostic line-status Home card this plan was
> originally written against, and replaced them with a single aggregated repositories home
> plus a per-organisation sidebar whose repo links scroll an in-page anchor. The route tree
> and the repo-selection decisions below are revised accordingly.

## Problem

The web UI (`Switchboard.WebSPA`) is a single-page app whose every screen renders at the
same URL (`/`). Navigation is held in component-local `useState`, so the browser address
bar never reflects the page being viewed (GitHub issue #15). Consequences: you cannot
deep-link or bookmark a page, the browser Back/Forward buttons don't move between screens,
and a reload always drops you back to the home screen.

After the sidebar restructure there are now **two** hand-rolled navigators (down from three;
`WorktreesHub`'s master-detail navigator was removed):

1. **`AppShell`** — `view: 'home' | 'new-repo'` (the aggregated repositories home vs. the
   New-repository clone flow), plus `pendingScrollAnchor: <anchor-id> | null` — which
   repository section to scroll into view. A sidebar repo link sets `view: 'home'` and a
   pending scroll target; a mount-then-scroll effect brings that repo's section into view.
2. **`ReposFlow`** — `repoId: <id> | null` (New repository screen ↔ the transient
   GettingReady clone-in-progress screen).

The repositories home (`ReposHome`) renders **every cloned repository on one page**, grouped
by organisation, each repo an anchored section (`id="repo:<owner>/<repo>"`) with its
`<Worktrees>` rendered inline. "Selecting a repository" is therefore an **in-page scroll to a
section**, not a navigation to a separate page — but it is still pure `useState` (the
`pendingScrollAnchor`), so it is not URL-addressable either.

## Architecture summary

Introduce **TanStack Router** as the WebSPA's client-side router, using **browser history
(clean paths)**. It pairs naturally with the TanStack Query already in use and gives
type-safe routes.

The router is mounted at the app entry (`apps/web/src/main.tsx`) via `RouterProvider`,
replacing the direct render of `<AppShell />`. `AppShell` becomes the **root route's layout
component**: its header and per-organisation navigation rail (`ReposNav`) persist across
routes, and its `<MantineAppShell.Main>` region renders an `<Outlet />` instead of the
`view`-switch. The top-level `view` `useState` is replaced by route matches; the active nav
item derives from the current route.

Agreed route tree (scope: top-level pages **+ repo-anchor deep-links**):

```
/                  ReposHome — all cloned repos, grouped by org, each an anchored      (AppShell layout, index route)
                   section with its worktrees inline
/new-repo          ReposFlow — New repository clone flow                               — its internal repoId→GettingReady
                                                                                         stays LOCAL state (out of scope)
/$owner/$repo      ReposHome (the SAME component) + scroll the addressed repo's        — repoId = `owner/repo`; scroll to
                   section (`repo:<owner>/<repo>`) into view                              anchor `repo:<owner>/<repo>`
```

**Key shape change from the original plan:** `/$owner/$repo` is **not a separate "detail"
page** — it renders the same `ReposHome` as `/` and merely carries a scroll intent derived
from the URL. The existing `pendingScrollAnchor` mechanism is re-sourced from the route
params instead of a click handler: the sidebar repo buttons become typed
`<Link to="/$owner/$repo">`, and a deep-link / reload onto `/$owner/$repo` reuses the same
mount-then-scroll effect to bring the section into view once the cloned-repos list has
resolved and the section has mounted. A click and a deep-link thus unify — both set the
scroll target through the URL.

Because there is no separate detail component to protect, an unrecognised id
(malformed, or well-formed but not currently cloned) needs **no redirect and no guard**: the
route renders the home page and the scroll target is simply not found, so the scroll
no-ops — a graceful, error-free degradation. `repoId` is the canonical `<owner>/<repo>`
(`packages/shared` `toRepoId`), which contains a slash, so the route uses two params
(`$owner`/`$repo`) and rebuilds the id for the anchor.

This is a **web-only vertical slice**: no `packages/shared` contract and no `apps/server`
route changes (the existing `RepoTarget` / `toRepoId` helpers cover the param round-trip).
GettingReady is deliberately left as `ReposFlow` local state — it is transient and bound to
an in-flight clone operation, so a deep-link to it would point at nothing.

## Plan page

None — this `plan.md` is the complete plan. (A single, single-session-scale, web-only
change; no `docs/plans` page is warranted.)

## Planned architecture

None — no architectural impact. Routing is internal structure of `Switchboard.WebSPA`,
below the modeled granularity: the LikeC4 model (`docs/dev/Architecture/model.c4`) treats
`WebSPA` as a single container and decomposes only the API into components. No new
containers, components, or relationships — so no `Planned/*.c4` overlay and the Codex
**Architecture** checkpoint does not fire.

## Decisions

1. **Scope = top-level pages + repo-anchor deep-links.** URLs for `/`, `/new-repo`, and
   `/$owner/$repo`. The repo deep-link renders the aggregated home and **scrolls** to the
   repo's section; it is not a separate page. GettingReady stays local `ReposFlow` state — a
   transient clone-in-progress screen tied to an in-flight operation, so routing it would be
   fragile and low-value. *(Revised from the original "top-level pages + repo selection via a
   list→detail page swap": PR #17 removed the master-detail `WorktreesHub`, so repo selection
   is now a scroll target on the single aggregated home, not a page swap.)*
2. **Router = TanStack Router.** Synergy with the TanStack Query already in the stack, and
   type-safe routes. *(Unchanged. Rejected: react-router — no type-safety win here; wouter —
   weaker nested-route/type story; hand-rolled — reinvents history/back/params.)*
3. **URL mode = clean browser-history paths.** Nicer URLs; works under Vite's history-API
   fallback today (dev `5173` and `vite preview`). Now covers the repo sub-paths too.
   **Constraint:** wherever the *built* SPA is served in production, that server must serve
   `index.html` as a history fallback for unknown paths. Production serving is owned by the
   active `runtime-cli-docker` change — see `dependencies.md` (constraint, not a `depends-on`).
4. **Repo deep-link = clean sub-path that scrolls, NOT a guarded detail route.**
   `/$owner/$repo` renders `ReposHome` and scrolls to `repo:<owner>/<repo>`. *(User decision,
   2026-06-28.)* This **supersedes the original detail-route + `beforeLoad` existence-guard
   design.* Consequences:
   - No separate `Worktrees` detail route/component, no `Link to="/worktrees"` back control,
     no repo-list page (`/worktrees`).
   - **No redirect on invalid/un-cloned ids.** Because the route renders the same home
     regardless, a malformed or not-currently-cloned id simply renders home and the
     scroll no-ops — there is no errored detail view to guard against. The `['cloned-repos']`
     query is therefore **not** consulted as a route guard (it stays a rendering concern of
     `ReposHome`/`ReposNav`).
   - **Sub-decision (open):** bare `/$owner/$repo` vs. a `/repos/$owner/$repo` prefix.
     Recommend **bare** for the cleanest URL — the only other top-level path is the
     single-segment `/new-repo`, and repo paths are two segments, so they cannot collide. The
     trade-off is that a bare two-segment dynamic route is greedy (it matches any future
     two-segment path); confirm in design (open-Q #2).
5. **No router loaders.** Leaf components keep their own `useQuery`; the router maps URL →
   component (+ scroll intent) only. *(Unchanged.)* Note this is now strictly simpler than the
   original plan: with the existence guard removed (D4), no route `beforeLoad` needs the query
   cache, so the **router context carries only `{ client, liveSessions }`** for `AppShell` —
   it does not need the `queryClient` threaded in for a guard.
6. **`AppShell` → layout is a smaller change than originally planned.** `ReposHome` already
   exists as its own component (PR #17 extracted it from `AppShell`; the old line-status Home
   card was deleted), so there is **no "extract Home from AppShell" step**. The work is: drop
   the `view`/`pendingScrollAnchor` `useState`, render `<Outlet />`, read
   `client`/`liveSessions` from route context, convert `ReposNav`'s repo buttons + the
   New-repository action to typed `Link`s, and re-source the scroll target from route params.
7. **Active nav state from the route.** The current repo's sidebar `Link` (on `/$owner/$repo`)
   and the New-repository `Link` (on `/new-repo`) reflect active state from the route, not a
   `view` flag. On `/` no repo is active. *(Confirm exact semantics in design — open-Q #3.)*
8. **Documentation destination (seed for the ledger):** author/update a **Routing** section
   in `apps/web/CLAUDE.md` — TanStack Router, where the code-based route tree lives, the URL
   scheme (incl. the repo-anchor sub-path), and the clean-path prod `index.html`-fallback
   requirement. No `docs/plans` page to retire; no permanent architecture-doc change.

## Open questions

1. **Prod SPA-fallback cross-reference (capability touch-point with `runtime-cli-docker`).**
   Decision 3 imposes a requirement on whoever serves the built SPA in production. This is
   **not** a `depends-on` — page-routing works today under Vite and neither change blocks the
   other — but it must not be lost. Settled in `dependencies.md` as an explicit forward
   constraint + a `web-navigation` spec scenario ("a page survives a reload"). *(Resolved.)*
2. **Repo sub-path shape (confirm Decision 4 sub-decision).** Bare `/$owner/$repo` vs.
   `/repos/$owner/$repo`. Confirm during design, weighing URL cleanliness against the greedy
   two-segment match.
3. **Active-nav + scroll semantics for the repo route.** Confirm in design: (a) on
   `/$owner/$repo` which sidebar item is marked active; (b) does navigating between two repos
   create distinct history entries (so Back re-scrolls to the previous repo); (c) the
   deep-link-on-load scroll must wait for the `['cloned-repos']` query to resolve **and** the
   section to mount — the existing mount-then-scroll effect handles this, but confirm it is
   driven cleanly from the route param (incl. Back/Forward between anchors, where only the
   scroll changes, not the rendered page).
4. **Testing approach.** `AppShell.test.tsx` renders the Default story to static markup; once
   `AppShell` is a layout-with-`<Outlet>`, navigation tests need a router context (TanStack
   `createMemoryHistory` / a test router). Existing E2E (`app-shell.spec.ts` `goto('/')`,
   sidebar repo-select) stay testid-based and should remain valid, but a new E2E asserting the
   URL changes on navigation (incl. a repo deep-link that scrolls and survives reload) is
   warranted. Detail in design/tasks. *(Scroll assertions in static-markup tests are
   limited — the scroll-into-view behaviour belongs to the Storybook test-runner / Playwright,
   not SSR markup.)*
