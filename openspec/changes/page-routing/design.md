## Context

The web SPA holds all navigation in component-local `useState`, so the URL never reflects the
current page (issue #15). After the `repositories home + per-organisation sidebar` restructure
(PR #17) the navigators are now **two**: `AppShell.view` (`'home' | 'new-repo'`) plus
`AppShell.pendingScrollAnchor` (which repo section to scroll to), and `ReposFlow.repoId`
(New repository ↔ transient GettingReady). `plan.md` agreed the target: TanStack Router with
clean browser-history paths, scoped to the top-level pages plus a **repo-anchor deep-link**
(`/$owner/$repo` renders the aggregated home and scrolls to that repo's section), leaving
`ReposFlow`'s transient GettingReady step as local state.

Current harness facts that constrain the design:
- Web unit tests run under **Vitest (`environment: 'node'`)** and render **composed
  Storybook stories to static markup** (`composeStories` + `renderToStaticMarkup`), wrapped
  by the global `AppProviders` decorator (Mantine theme + TanStack Query). There is no
  `@testing-library/react` / client DOM render in the suite — and **no scroll**, so
  scroll-into-view behaviour cannot be asserted in unit tests.
- Interactive behaviour is asserted by the **Storybook test-runner** (browser play
  functions) and end-to-end by **Playwright** against the built server + `vite preview`.
- `AppShell` currently renders the chrome (header + `ReposNav` rail), owns the shared
  `['cloned-repos']` query that feeds both the sidebar and `ReposHome`, switches `view`
  between `ReposHome` and `ReposFlow`, and runs a mount-then-scroll effect off
  `pendingScrollAnchor`. It takes `client` and `liveSessions` as props for injection in
  stories/tests. `ReposHome` already exists as its own component (PR #17 extracted it; the
  old line-status Home card was deleted).

## Goals / Non-Goals

**Goals:**
- The address bar reflects the current page; the URL on load/reload determines what renders;
  browser Back/Forward move between pages.
- Deep-link to a repository (`/$owner/$repo`) renders the home and scrolls that repo's
  section into view.
- Keep it a web-only slice with no `shared`/`server` contract changes.

**Non-Goals:**
- Routing `ReposFlow`'s New-repository ↔ GettingReady transition (stays local state).
- Router data **loaders** — leaf components keep their own `useQuery`; the router maps URL →
  component (+ scroll intent) only.
- **A redirect/guard for unknown repo ids.** Because `/$owner/$repo` renders the same home
  regardless, a malformed or un-cloned id renders the home and the scroll no-ops — there is
  no errored detail view to guard against, and the `['cloned-repos']` query is not consulted
  as a route guard.
- Server-side SPA serving / production `index.html` fallback (owned by `runtime-cli-docker`).
- Auth or route guards beyond the existing bearer mechanism.

## Decisions

**D1. `@tanstack/react-router` with a code-based route tree.** Define
`createRootRouteWithContext()(…)`, child routes via `createRoute`, assembled with
`createRouter`. No `@tanstack/router-plugin` Vite plugin and no generated `routeTree.gen.ts`
— three routes are clearer hand-written, codegen-free, and still fully type-safe.

**D2. `AppShell` becomes the root-route layout.** `createRootRoute({ component })` renders
`AppShell`, whose `<MantineAppShell.Main>` renders `<Outlet />`; the header and `ReposNav` rail
persist across routes. **No Home extraction is needed** — `ReposHome` already exists, so the
`/` index route renders it directly; `AppShell` drops the `view` and `pendingScrollAnchor`
`useState` and becomes pure chrome. It keeps the shared `['cloned-repos']` `useQuery` that
builds the sidebar's org groups.

**D3. Thread injection through router context, not props.** Because the router instantiates
the root component, `AppShell`'s `client` / `liveSessions` props can't be passed directly.
The router context carries `{ client: SwitchboardClient; liveSessions: number }`
(`createRootRouteWithContext<…>()`); `client`/`liveSessions` default to
`createSwitchboardClient()` / `0`. Route components read context with
`Route.useRouteContext()`; stories/tests build a memory-history router with a test context
(injected `client`, chosen `liveSessions`). *(Simpler than the original design: with the
existence guard removed (D4), no route `beforeLoad` runs outside React, so the `queryClient`
does **not** need to be threaded into the router context — the shared `['cloned-repos']`
query stays inside `AppShell`/`ReposHome` under the existing `AppProviders` `QueryClient`.)*

**D4. Route tree, params & scroll.**
| Path | Component | Notes |
|---|---|---|
| `/` | ReposHome | aggregated home (index route) |
| `/new-repo` | ReposFlow | internal repoId→GettingReady stays local state |
| `/$owner/$repo` | ReposHome (same component) | scroll to `repo:${owner}/${repo}` |

`repoId` is `<owner>/<repo>` (contains a slash) → two params (`$owner`/`$repo`) avoid encoding
pitfalls; the anchor id is rebuilt as `` `repo:${owner}/${repo}` `` (matching
`repoAnchorId`/`group-repos`). The `/$owner/$repo` route renders the same `ReposHome` as `/`
and re-sources the existing **mount-then-scroll** effect from the route params: scroll once
the addressed section has mounted (guard on `getElementById`), re-running when the
`['cloned-repos']` list resolves so a section that mounts after load is still reached. **No
`beforeLoad`, no redirect, no membership check** — an unrecognised id renders the home and the
effect finds no element, so the scroll no-ops (graceful, error-free). `ReposNav`'s repo
buttons become typed `Link to="/$owner/$repo" params={{ owner, repo }}`; its "New repository"
action becomes `Link to="/new-repo"`. **Bare sub-path** `/$owner/$repo` is used (no `/repos/`
prefix) for the cleanest URL — the only sibling top-level path, `/new-repo`, is single-segment
so cannot collide; the greedy two-segment match is accepted given the small route set, and a
future static top-level path would take priority over the dynamic route. *(Resolves plan
open-Q #2.)*

**D5. Clean browser-history paths.** `createRouter` default history. Documented constraint:
production serving must return `index.html` for unknown paths (Vite dev + `preview` already
do). *(Plan Decision 3.)*

**D6. Active nav state from the route.** Nav `Link`s use TanStack Router's active state
(`activeProps` / `data-status`): on `/$owner/$repo` the addressed repository's sidebar `Link`
is marked active; on `/new-repo` the "New repository" `Link` is active; on `/` no repository
is active. *(Resolves plan open-Q #3a.)*

**D7. History + scroll semantics.** Each repo `Link` is a history *push*, so navigating between
repositories creates distinct history entries: Back re-applies the previous repo's URL (and so
re-scrolls to it) and Forward re-applies the next. Because `/` and `/$owner/$repo` render the
same `ReposHome`, moving between two repo anchors changes only the URL + scroll position, not
the rendered tree — the scroll is driven by the route-param effect on each match. The
deep-link-on-load scroll waits for both the `['cloned-repos']` query to resolve **and** the
target section to mount (the mount-then-scroll guard). *(Resolves plan open-Q #3b/c.)*

## Testing strategy

**Capabilities under test** (from the `web-navigation` spec): URL reflects page; URL
determines page on load/reload; Back/Forward navigate; a repo deep-link scrolls to its
section; an unknown repo id renders the home (no redirect, no error).

**Unit (Vitest, node env, static markup):**
- At initial path `/`: `AppShell` chrome renders (the adapted existing `AppShell.test`) and
  `ReposHome` (its repos / loading / empty state) is present.
- Nav `Link`s render with the correct `href` (the "New repository" `Link` → `/new-repo`; the
  sidebar repo `Link`s → `/<owner>/<repo>` for the seeded cloned repos).
- Initial path `/new-repo` renders `ReposFlow`; initial path `/<owner>/<repo>` renders
  `ReposHome` (the same home).
- A **malformed/un-cloned** `/<bad>/<id>` still renders `ReposHome` (no redirect, no error).
- **Out of scope for unit tests:** the scroll-into-view itself (no scroll in node/static
  markup) — covered by the Storybook test-runner / Playwright below.

**Browser (Storybook test-runner play functions) — memory-history, so *in-app* outcomes
only.** The Storybook decorator mounts a **memory-history** router (harness task 1.3), which
mutates router state but does **not** touch `window.history` or the browser address bar — so
play functions assert only what is observable without the real history stack: clicking the
"New repository" `Link` swaps the main content; clicking a sidebar repo `Link` scrolls that
repository's section into view and marks it active in the nav. They do **not** assert the
address bar or the browser Back/Forward buttons (memory history can't drive them — asserting
otherwise would test different semantics than clean browser-history routing and give false
confidence). `AppShell` stories are remounted within the router decorator (they can no longer
render standalone).

**E2E (Playwright) — the sole owner of real browser-history assertions.** A new spec asserts
the **address bar** updates on navigation; that the **browser Back/Forward** buttons move
between pages (incl. repository A → B → Back → Forward moving the URL *and* the scrolled
section between the two anchors, per D7); and that a deep-linked `/new-repo` and a cloned
repo's `/<owner>/<repo>` load directly, scroll the section into view, **and survive a
reload** — exercising the clean-path / Vite history-fallback behaviour end-to-end. Existing
`app-shell.spec.ts` (`goto('/')`) and the worktree spec stay valid.

**Harness gap → leading "Test infrastructure" task group.** No router test harness exists
today, and it is required before the behaviour above can be tested:
1. A **memory-history router factory** for tests/stories: builds a `createRouter` over the
   real route tree with `createMemoryHistory({ initialEntries: [path] })` and a test context
   (injected `client`, `liveSessions`).
2. A **`renderWithRouter(router)` helper** that `await router.load()` **before**
   `renderToStaticMarkup` — TanStack Router resolves matches asynchronously, so static
   markup must be taken after load or it captures the pending state.
3. A **Storybook router decorator** so `AppShell`/page stories mount inside a memory router
   (replacing the standalone render the current stories assume).

## Risks / Trade-offs

- **[Static-markup tests capture the router's pending state]** → the `renderWithRouter`
  helper loads the router before rendering; navigation/scroll assertions that need a live DOM
  go to the Storybook test-runner / Playwright rather than SSR markup.
- **[`AppShell` → layout breaks its existing test/stories]** → adapting them is explicit
  test-infra work (the harness task group); the chrome assertions move under a `/` render.
- **[Clean paths 404 on a future static host without fallback]** → captured as the
  `web-navigation` "survives reload" scenario + the noted `runtime-cli-docker` constraint;
  mitigated today by Vite's history fallback.
- **[New dependency / bundle size]** → accepted: TanStack Router is modest and pairs with the
  TanStack Query already in the stack, buying type-safe routes.
- **[Bare `/$owner/$repo` is a greedy two-segment route]** → accepted given the small route
  set; static top-level paths (e.g. `/new-repo`) take priority over the dynamic route, and a
  `/repos/` prefix can be introduced later if the top-level path space grows.
- **[A deep-link to an un-cloned repo renders the home silently]** → the scroll no-ops with no
  indication the repository is missing. Accepted as graceful degradation (better than an
  errored detail page); a "repository not found" hint could be added later (out of scope).

## Migration Plan

Incremental, no data migration: add `@tanstack/react-router`; build the route tree + router
context; convert `AppShell` to the layout-with-`<Outlet>` (drop `view`/`pendingScrollAnchor`,
route top-level navigation through the router); add the `/$owner/$repo` route with the
route-param scroll effect; convert `ReposNav` to typed `Link`s with active state; build the
router test harness and adapt `AppShell` test/stories; add the navigation + deep-link E2E;
document the Routing section in `apps/web/CLAUDE.md`.

## Open Questions

None blocking — plan open-questions #2 (repo sub-path shape) and #3 (active-nav + scroll
semantics) are resolved above (D4, D6, D7). The `runtime-cli-docker` prod-fallback constraint
(plan open-Q #1) is settled as a spec scenario + a noted constraint, not a `depends-on` (see
`dependencies.md`).
