import { useState, type ReactNode } from 'react';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import { createAppRouter } from './routes';
import { stubLinkRouter } from './test-router';

/**
 * Storybook router helpers (design Testing strategy, task 1.3). Stories mount under **memory
 * history** — the browser test-runner asserts in-app outcomes (content swap, scroll, active nav),
 * never the address bar / Back-Forward (those are Playwright's, per design). The global preview
 * decorator already supplies `AppProviders` (Mantine + TanStack Query), so these only add routing.
 */

export interface RoutedAppProps {
  /** Initial URL the story "loads" at. Defaults to `/`. */
  path?: string;
  /** Injected client wired into the router context (mirrors the old `AppShell` story arg). */
  client?: SwitchboardClient;
  /** Live Claude session count shown in the header. */
  liveSessions?: number;
}

/**
 * Mount the whole application router (root = `AppShell`) at `path`, threading the story's
 * `client`/`liveSessions` into the router context (design D3). The router is built once so
 * play-function navigation persists across re-renders.
 */
export function RoutedApp({ path = '/', client, liveSessions = 0 }: RoutedAppProps) {
  const [router] = useState(() =>
    createAppRouter({
      context: { client: client ?? createSwitchboardClient(), liveSessions },
      history: createMemoryHistory({ initialEntries: [path] }),
    }),
  );
  return <RouterProvider router={router} />;
}

/**
 * Mount a single Link-using component (e.g. `ReposNav`) in isolation under a stub router that
 * declares the app's link-target paths, so its typed `<Link>`s resolve without the whole app.
 */
export function StubRouterStory({ children, path = '/' }: { children: ReactNode; path?: string }) {
  const [router] = useState(() => stubLinkRouter(children, path));
  return <RouterProvider router={router} />;
}
