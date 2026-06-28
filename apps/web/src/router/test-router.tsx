import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRoute,
  type AnyRouter,
} from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import type { RepoTarget } from '@switchboard/shared';
import type { SwitchboardClient } from '../api/client';
import { AppProviders } from '../providers/AppProviders';

export interface MemoryRouterOptions {
  /** Initial history entry — the URL the test/story "loads" at. Defaults to `/`. */
  path?: string;
  /** Root router context. The app tree expects `{ client, liveSessions }` (design D3). */
  context?: unknown;
}

/**
 * Build a TanStack router over `routeTree` driven by **in-memory history** — the test/story router
 * (design Testing strategy). `initialEntries: [path]` seeds the "loaded at" URL and `context`
 * injects the root route context. Permissively typed because it is reused across throwaway trees
 * (the harness proof) and the real app tree; the production `createAppRouter` is strongly typed.
 */
export function memoryRouter(routeTree: AnyRoute, options: MemoryRouterOptions = {}): AnyRouter {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [options.path ?? '/'] }),
    context: options.context,
  } as Parameters<typeof createRouter>[0]) as AnyRouter;
}

export interface RenderWithRouterOptions {
  /** Pre-seeded TanStack Query cache (e.g. `setQueryData(['cloned-repos'], …)`). */
  queryClient?: QueryClient;
}

/**
 * Render a built router to static markup **after** loading it. TanStack Router resolves matches
 * asynchronously, so markup taken before `router.load()` captures the pending state; we load first
 * (design "Static-markup tests capture the router's pending state" risk). Wrapped in `AppProviders`
 * so routed components have Mantine + a TanStack Query cache, mirroring the app entry.
 */
export async function renderWithRouter(
  router: AnyRouter,
  options: RenderWithRouterOptions = {},
): Promise<string> {
  await router.load();
  return renderToStaticMarkup(
    <AppProviders queryClient={options.queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

/**
 * A `QueryClient` with the shared `['cloned-repos']` list pre-seeded and frozen fresh
 * (`staleTime: Infinity`), so a static render reads the seeded repos synchronously without firing a
 * background refetch against the stub client. This is how route tests "seed the cloned-repos query
 * in the test context" (design Testing strategy / tasks 2.1, 3.1).
 */
export function seededClonedReposClient(repos: RepoTarget[]): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['cloned-repos'], { repos });
  return queryClient;
}

/** A never-invoked `SwitchboardClient` for tests whose data is pre-seeded into the query cache. */
export function stubClient(): SwitchboardClient {
  return {} as unknown as SwitchboardClient;
}

/**
 * A `SwitchboardClient` whose every endpoint returns a never-resolving promise — so when the seeded
 * home renders its repositories, each inline `<Worktrees>` query stays *pending* (loading state)
 * rather than throwing against a stub. Pair with `seededClonedReposClient` (which feeds the home
 * synchronously) for populated-home route tests.
 */
export function pendingClient(): SwitchboardClient {
  const pending = new Promise<never>(() => {});
  const node = (): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop) => (prop === 'then' ? undefined : node()),
      apply: () => pending,
    });
  return node() as SwitchboardClient;
}

/**
 * A throwaway router that renders `node` at its root and declares the app's link-target paths
 * (`/`, `/new-repo`, `/$owner/$repo`), so a Link-using component (e.g. `ReposNav`) can be rendered
 * in **isolation** — the typed `<Link>`s resolve their hrefs against these routes without mounting
 * the whole app. Pair with `renderWithRouter` (which loads before static markup).
 */
export function stubLinkRouter(node: ReactNode, path = '/'): AnyRouter {
  const root = createRootRoute({ component: () => <>{node}</> });
  const children = [
    createRoute({ getParentRoute: () => root, path: '/', component: () => null }),
    createRoute({ getParentRoute: () => root, path: 'new-repo', component: () => null }),
    createRoute({ getParentRoute: () => root, path: '$owner/$repo', component: () => null }),
  ];
  return memoryRouter(root.addChildren(children), { path });
}
