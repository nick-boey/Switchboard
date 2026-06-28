## Why

Every screen in the web SPA renders at the same URL (`/`) because navigation is held in
component-local `useState` (GitHub issue #15): pages cannot be deep-linked or bookmarked,
the browser Back/Forward buttons don't move between screens, and a reload always returns to
home. Since the `repositories home + per-organisation sidebar` restructure (PR #17), even
"selecting a repository" is an in-page scroll held in `useState` (`pendingScrollAnchor`), so
a specific repository's worktrees can't be linked to either.

## What Changes

- Add **TanStack Router** to `apps/web` and mount it at the app entry (`main.tsx`) via
  `RouterProvider`, replacing the direct render of `<AppShell />`.
- Convert `AppShell` into the **root route layout**: the header and per-organisation
  navigation rail (`ReposNav`) persist across routes and the main region renders an
  `<Outlet />`. The top-level `view: 'home' | 'new-repo'` and the `pendingScrollAnchor`
  `useState` are removed in favour of route matches, and the active nav item derives from the
  current route.
- Define a code-based route tree using **clean browser-history paths**:
  - `/` — Repositories home (`ReposHome`): every cloned repo on one page
  - `/new-repo` — New repository (`ReposFlow`)
  - `/$owner/$repo` — the **same** `ReposHome`, with the addressed repository's section
    scrolled into view
- Convert `ReposNav`'s repo buttons to typed router `Link`s to `/$owner/$repo` and its
  "New repository" action to a `Link` to `/new-repo`. The sidebar click and a deep-link /
  reload **unify**: both set the scroll target via the URL, and the existing mount-then-scroll
  effect is re-sourced from the route params (`repo:<owner>/<repo>`) instead of a click
  handler. An unrecognised id — malformed, or well-formed but not currently cloned — renders
  the home and the scroll simply **no-ops**: there is no separate detail page to guard, so no
  redirect and no error.
- **Out of scope:** `ReposFlow`'s internal New-repository ↔ GettingReady transition stays
  local `useState` — GettingReady is transient and bound to an in-flight clone operation,
  so it is intentionally not URL-addressable.
- **Constraint (not a dependency):** clean paths require that wherever the *built* SPA is
  served in production, the server returns `index.html` as a history fallback for unknown
  paths. This works today under Vite (dev + `preview`); production serving is owned by the
  active `runtime-cli-docker` change and must honour this. Captured as a `web-navigation`
  spec scenario ("a page survives a reload"), not as a `depends-on` — this change works under
  Vite today and neither change blocks the other.

No UI prototypes are needed: this change wires existing screens to a router and introduces
no new component or layout to explore in Storybook (it was classified `switch-feature`, not
`switch-feature-ui`).

## Capabilities

### New Capabilities
- `web-navigation`: URL-addressable pages in the web SPA — the address bar reflects the
  current page, navigation updates the URL, the URL on load/reload determines the page
  shown, browser Back/Forward move between pages, and a deep-link to a repository
  (`/<owner>/<repo>`) renders the home and scrolls that repository's section into view (a
  no-op render of the home when the repository is not currently cloned).

### Modified Capabilities
<!-- None. No existing capability spec covers web navigation/routing; AppShell, ReposHome,
     and ReposNav composition is not currently spec'd, and the repo-clone /
     worktree-management specs describe their flows, not URL addressing. -->

## Impact

- **Code (web-only slice):** `apps/web/src/main.tsx` (mount `RouterProvider`), a new route
  module/tree, `apps/web/src/components/AppShell.tsx` (layout + `<Outlet/>`, drop `view` and
  `pendingScrollAnchor` state, route-param scroll, keep the shared `['cloned-repos']` query
  feeding `ReposNav`), `apps/web/src/repos/ReposNav.tsx` (typed `Link`s, active state).
  `ReposHome` is reused unchanged for both `/` and `/$owner/$repo`. No `packages/shared`
  contract or `apps/server` route changes — the existing `RepoTarget` / `toRepoId` helpers
  cover the param round-trip (the anchor id reconstruction); no `isValidRepoId` guard is
  needed, since an unknown id degrades to a no-op scroll rather than a redirect.
- **Dependencies:** add `@tanstack/react-router` to `apps/web`.
- **Tests:** unit tests that mount routed components need a router context (TanStack
  `createMemoryHistory`); `AppShell.test.tsx` adapts to the layout-with-`<Outlet>` shape.
  The scroll-into-view behaviour is **not** assertable in static-markup unit tests — it is
  covered by the Storybook test-runner and Playwright. Existing E2E (`app-shell.spec.ts`
  `goto('/')`, sidebar repo-select) stay testid-based and remain valid; a new E2E should
  assert the URL changes on navigation and that a repo deep-link loads, scrolls, and survives
  a reload.
- **Docs:** add a Routing section to `apps/web/CLAUDE.md`.
- **Cross-change:** imposes the prod `index.html`-fallback constraint on `runtime-cli-docker`
  (surfaced above; no artifact of that change is edited here).
