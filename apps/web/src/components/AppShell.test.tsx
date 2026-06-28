import { describe, it, expect } from 'vitest';
import { createMemoryHistory } from '@tanstack/react-router';
import { createAppRouter } from '../router/routes';
import { renderWithRouter, seededClonedReposClient, stubClient } from '../router/test-router';

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
