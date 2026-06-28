import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import type { RepoTarget } from '@switchboard/shared';
import type { SwitchboardClient } from '../api/client';
import { sessionLivenessQueryKey } from '../sessions/session-queries';
import { AppShell } from './AppShell';
import { createAppRouter } from '../router/routes';
import {
  renderWithRouter,
  seededClonedReposClient,
  stubClient,
  stubLinkRouter,
} from '../router/test-router';

/**
 * `AppShell` is now the **root-route layout** (design D2), so it can no longer render standalone —
 * its `<Outlet/>` and the sidebar `<Link>`s need a loaded router. We mount the app router at `/`
 * via the harness (which loads before static markup) and assert the persistent chrome — tracked
 * wordmark, brand plug, burger, live-session count — plus the navbar's `ReposNav` and the main
 * region's repositories home (empty CTA, from the seeded empty `['cloned-repos']` list). The retired
 * "Line status" card and old "Worktrees" nav entry must be gone. The responsive drawer↔rail and dark
 * resolution are asserted in the browser by the Mobile / Desktop / Dark stories under the test-runner.
 */
function appHtmlAt(path: string, liveSessions = 0): Promise<string> {
  const router = createAppRouter({
    context: { client: stubClient(), liveSessions },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return renderWithRouter(router, { queryClient: seededClonedReposClient([]) });
}

describe('AppShell root layout', () => {
  it('renders the persistent chrome with the repositories home and ReposNav', async () => {
    const html = await appHtmlAt('/');
    expect(html).toContain('data-testid="app-shell"');
    expect(html).toContain('Switchboard');
    expect(html).toContain('data-testid="nav-burger"');
    expect(html).toContain('data-testid="brand-mark"');
    expect(html).toContain('data-testid="live-session-count"');
    // Navbar renders the per-organisation sidebar navigation with its "New repository" action.
    expect(html).toContain('data-testid="nav-rail"');
    expect(html).toContain('data-testid="repos-nav"');
    expect(html).toContain('data-testid="nav-new-repository"');
    // Main region renders the repositories home (empty list → clone CTA).
    expect(html).toContain('data-testid="repos-home-empty"');
    // The retired "Line status" card is gone, and so is the old "Worktrees" nav entry.
    expect(html).not.toContain('data-testid="line-status"');
    expect(html).not.toContain('data-testid="nav-worktrees"');
  });

  it('shows the live session count from the router context', async () => {
    const html = await appHtmlAt('/', 3);
    expect(html).toContain('3 live');
  });
});

/**
 * Header live-session count derives from real liveness (fix-live-session-indicator). With no
 * injected `liveSessions` prop, the header must reflect the AGGREGATE of every cloned repository's
 * live sessions — not the old hardcoded `0`. We seed the shared TanStack Query cache (the
 * `['cloned-repos']` list and each repo's `sessionLivenessQueryKey` set) so the server render
 * resolves the queries synchronously, then assert the rendered count. `stubLinkRouter` mounts the
 * shell in isolation — its sidebar `<Link>`s resolve and its `<Outlet/>` renders nothing — so the
 * header count is asserted without the home, and the injected `client` is never called.
 */
describe('AppShell header live-session count (derived)', () => {
  const REPOS: RepoTarget[] = [
    { owner: 'acme', repo: 'infra' },
    { owner: 'nick-boey', repo: 'switchboard' },
  ];
  const fakeClient = {} as SwitchboardClient;

  function seededClient(live: Record<string, Set<string>>): QueryClient {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    qc.setQueryData(['cloned-repos'], { repos: REPOS });
    for (const [repoId, set] of Object.entries(live)) {
      qc.setQueryData(sessionLivenessQueryKey(repoId), set);
    }
    return qc;
  }

  it('reflects the aggregate live-session count across repositories, not a hardcoded 0', async () => {
    const qc = seededClient({
      'acme/infra': new Set(['a--0123456789ab', 'b--abcdef012345']),
      'nick-boey/switchboard': new Set(['c--1']),
    });
    // No `liveSessions` prop → the shell derives the count from the seeded per-repo liveness.
    const html = await renderWithRouter(stubLinkRouter(<AppShell client={fakeClient} />), {
      queryClient: qc,
    });
    expect(html).toContain('data-testid="live-session-count"');
    expect(html).toContain('3 live sessions');
    expect(html).not.toContain('0 live sessions');
  });

  // Self-correction (the count UPDATES on the next liveness read of an already-mounted shell) needs a
  // live DOM with subscriptions — covered by the mounted jsdom test in
  // `AppShell.live-session-count.dom.test.tsx`, not a static server render.
});
