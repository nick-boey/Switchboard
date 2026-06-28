# CLAUDE.md — @switchboard/web

Module-specific guidance; see the repo-root CLAUDE.md for shared commands and workflow.

React 19 + Mantine UI, built with Vite. This is the **UI layer of a vertical slice**.

- Server state via **TanStack Query**; talk to the API through the typed client/contract from `@switchboard/server` and schemas from `@switchboard/shared`. Don't hand-roll fetch shapes.
- **Storybook prototypes** live in `src/prototypes/**` and are quarantined: app code under `src/**` must not import from them (ESLint enforces it). For new UI surfaces, explore in a Storybook prototype first via the `switch-ui-prototype` skill, then promote by moving the code into the slice. Prototypes render only in the **dedicated prototype workbench** (port 6007) — the production Storybook (6006) excludes them. Author with `definePrototypeMeta` (no title/change-name arg; the workbench indexer derives `Prototypes/<change>/<name>` + tags from the file location); dark mode is `prefers-color-scheme` only (the workbench preview sets `colorScheme="auto"`).
- Run the app: `pnpm --filter @switchboard/web dev`. Production Storybook: `pnpm --filter @switchboard/web storybook` (6006). Prototype workbench: `pnpm --filter @switchboard/web storybook:prototypes` (6007), static build `storybook:prototypes:build`.

## Routing

Client-side routing uses **TanStack Router** with a **code-based** route tree (no `@tanstack/router-plugin`, no generated `routeTree.gen.ts`) — it lives in `src/router/routes.tsx`. `AppShell` is the **root-route layout** (header + per-organisation `ReposNav` sidebar persist; the main region renders `<Outlet/>`). Injection (`{ client, liveSessions }`) is threaded through the **router context** (`createRootRouteWithContext`), not props, because the router instantiates the root; `main.tsx` mounts `<RouterProvider>` inside `AppProviders`.

URL scheme (**clean browser-history paths**):

| Path              | Page                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `/`               | Repositories home (`ReposHome` — all cloned repos on one page)                           |
| `/new-repo`       | New repository (`ReposFlow`)                                                             |
| `/<owner>/<repo>` | The **same** `ReposHome`, scrolled to that repo's section (anchor `repo:<owner>/<repo>`) |

A repo deep-link is **not a separate page** — `/$owner/$repo` renders the same home and the route re-sources a mount-then-scroll effect from its params; an unknown/un-cloned id renders the home and the scroll simply no-ops (no redirect, no guard). Sidebar repo links + the "New repository" action are typed router `<Link>`s.

Clean paths require the serving host to return **`index.html` as a history fallback** for unknown paths. Vite dev (`5173`) and `vite preview` provide this; **any production host serving the built SPA must too** (the `runtime-cli-docker` constraint — see that change / page-routing's `dependencies.md`), or deep-linked / reloaded routes 404.

**Testing routed components:** unit tests use the harness in `src/router/test-router.tsx` (a memory-history router + `renderWithRouter`, which `await router.load()` before `renderToStaticMarkup`). Stories mount under memory history via `src/router/story-router.tsx` and assert only **in-app** outcomes (content swap, scroll, active nav); the **address bar + browser Back/Forward + reload** are asserted only by Playwright (`e2e/page-routing.spec.ts`).
