import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
  useRouteContext,
  type RouterHistory,
} from '@tanstack/react-router';
import type { RepoTarget } from '@switchboard/shared';
import type { SwitchboardClient } from '../api/client';
import { AppShell } from '../components/AppShell';
import { ReposHome } from '../repos/ReposHome';
import { ReposFlow } from '../repos/ReposFlow';
import { repoAnchorId } from '../repos/group-repos';

/**
 * The code-based route tree (design D1/D4). `AppShell` is the root-route layout (header + sidebar
 * persist, `<Outlet/>` renders the page); the index `/` and `/$owner/$repo` both render the same
 * aggregated `ReposHome`, the latter scrolling to the addressed repo's section; `/new-repo` renders
 * the clone flow. Injection (`client`/`liveSessions`) is threaded through the router context (D3),
 * not props, because the router instantiates the root component. `liveSessions` is optional: when
 * omitted (the production app) the shell derives the count from real per-repo liveness
 * (fix-live-session-indicator); a number overrides it for Storybook/tests.
 */
export interface RouterContext {
  client: SwitchboardClient;
  liveSessions?: number;
}

/** Read the root-injected context loosely from any descendant route component (design D3). */
function useAppContext(): RouterContext {
  return useRouteContext({ strict: false }) as RouterContext;
}

/** Navigate to the New-repository page — the shared home/empty-CTA action, as a router navigation. */
function useGoToNewRepository(): () => void {
  const navigate = useNavigate();
  return () => void navigate({ to: '/new-repo' });
}

/**
 * Mount-then-scroll to the addressed repository's section (design D4/D7), re-sourced from the route
 * params instead of a click. Scrolls once the section has mounted (guard on `getElementById`), and
 * re-runs when the shared `['cloned-repos']` list resolves so a section that mounts after load is
 * still reached. No-ops (no error) when the id names no rendered section.
 *
 * **Layout-settling (impl-review finding):** each repository section's inline `<Worktrees>` resolves
 * its own queries *after* the anchor mounts, growing the page and pushing the target out of view. A
 * single scroll only proves the anchor mounted, not that the content above it reached its final
 * height — so we keep the target pinned via a `ResizeObserver` for a bounded settling window, then
 * stop (also stopping early on the first user scroll, so later scrolling is never hijacked).
 */
function useRepoAnchorScroll(client: SwitchboardClient, owner: string, repo: string): void {
  const anchorId = repoAnchorId({ owner, repo });
  const cloned = useQuery({
    queryKey: ['cloned-repos'],
    queryFn: async (): Promise<{ repos: RepoTarget[] }> => {
      const res = await client.api.repos.cloned.$get();
      if (!res.ok) throw new Error(`cloned repos failed: ${res.status}`);
      return res.json();
    },
  });
  useEffect(() => {
    const scrollToTarget = (): boolean => {
      const el = document.getElementById(anchorId);
      if (!el) return false;
      el.scrollIntoView({ block: 'start' });
      return true;
    };
    // Section not mounted yet — the `cloned.data` dependency re-runs this effect once it is.
    if (!scrollToTarget()) return;

    let stopped = false;
    // A `MutationObserver` (not `ResizeObserver`): the sections grow by adding DOM nodes that
    // overflow into the document scroll, which leaves `document.body`'s content-box size unchanged —
    // so a size observer never fires. DOM mutations are the reliable signal that content (and thus
    // the target's offset) changed; re-pin on each, bounded by the window/user-scroll below.
    const observer = new MutationObserver(() => {
      if (!stopped) scrollToTarget();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      clearTimeout(timer);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
    };
    // Stop pinning once the layout has had time to settle, or as soon as the user scrolls.
    const timer = setTimeout(stop, 1500);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchmove', stop, { passive: true });
    return stop;
  }, [anchorId, cloned.data]);
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function RootLayout() {
    const { client, liveSessions } = useAppContext();
    return <AppShell client={client} liveSessions={liveSessions} />;
  },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function RepositoriesHomePage() {
    const { client } = useAppContext();
    return <ReposHome client={client} onNewRepository={useGoToNewRepository()} />;
  },
});

const newRepoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'new-repo',
  component: function NewRepositoryPage() {
    const { client } = useAppContext();
    return <ReposFlow client={client} />;
  },
});

const repoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$owner/$repo',
  component: function RepositoryAnchorPage() {
    const { client } = useAppContext();
    const { owner, repo } = useParams({ strict: false }) as { owner: string; repo: string };
    useRepoAnchorScroll(client, owner, repo);
    return <ReposHome client={client} onNewRepository={useGoToNewRepository()} />;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, newRepoRoute, repoRoute]);

export interface CreateAppRouterOptions {
  /** Root router context (`{ client, liveSessions }`) — required because the root needs context. */
  context: RouterContext;
  /** History implementation. Browser history in the app; memory history in tests/stories. */
  history?: RouterHistory;
}

/** Build the application router over the shared route tree (design D1). */
export function createAppRouter(options: CreateAppRouterOptions) {
  return createRouter({
    routeTree,
    context: options.context,
    ...(options.history ? { history: options.history } : {}),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
