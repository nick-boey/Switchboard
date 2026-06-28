import { describe, it, expect } from 'vitest';
import { createMemoryHistory } from '@tanstack/react-router';
import type { RepoTarget } from '@switchboard/shared';
import { createAppRouter } from './routes';
import {
  pendingClient,
  renderWithRouter,
  seededClonedReposClient,
  stubClient,
} from './test-router';

const TWO_REPOS: RepoTarget[] = [
  { owner: 'acme-corp', repo: 'web-client' },
  { owner: 'nick-boey', repo: 'switchboard' },
];

/**
 * Top-level routing (design D2/D4, tasks 2.1): mounting the app router at `/` renders the persistent
 * `AppShell` chrome and the repositories home, and the sidebar's "New repository" control is a typed
 * `Link` to `/new-repo`. The home and sidebar read the seeded `['cloned-repos']` cache, so an empty
 * list renders the home's empty clone CTA under static markup.
 */
describe('app router — root layout and top-level pages', () => {
  it('renders the AppShell chrome and the repositories home at /', async () => {
    const router = createAppRouter({
      context: { client: stubClient(), liveSessions: 0 },
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    const html = await renderWithRouter(router, { queryClient: seededClonedReposClient([]) });

    // Persistent chrome.
    expect(html).toContain('data-testid="app-shell"');
    expect(html).toContain('data-testid="nav-rail"');
    expect(html).toContain('data-testid="repos-nav"');
    expect(html).toContain('data-testid="brand-mark"');
    // The repositories home renders in the main region (empty list → clone CTA).
    expect(html).toContain('data-testid="repos-home-empty"');
    // The "New repository" control is a typed Link to /new-repo.
    expect(html).toContain('data-testid="nav-new-repository"');
    expect(html).toContain('href="/new-repo"');
    // The retired line-status card and old "Worktrees" nav entry are gone.
    expect(html).not.toContain('data-testid="line-status"');
    expect(html).not.toContain('data-testid="nav-worktrees"');
  });

  it('renders the New repository flow at /new-repo', async () => {
    const router = createAppRouter({
      context: { client: stubClient(), liveSessions: 0 },
      history: createMemoryHistory({ initialEntries: ['/new-repo'] }),
    });

    const html = await renderWithRouter(router, { queryClient: seededClonedReposClient([]) });

    expect(html).toContain('data-testid="app-shell"');
    // The new-repository screen (NewRepository) renders, not the repositories home.
    expect(html).not.toContain('data-testid="repos-home-empty"');
    expect(html).toContain('data-testid="new-repository"');
  });

  it('renders the sidebar repo links to the clean deep-link path', async () => {
    const router = createAppRouter({
      context: { client: pendingClient(), liveSessions: 0 },
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    const html = await renderWithRouter(router, {
      queryClient: seededClonedReposClient(TWO_REPOS),
    });

    expect(html).toContain('data-testid="nav-repo:acme-corp/web-client"');
    expect(html).toContain('href="/acme-corp/web-client"');
  });
});

/**
 * Repo-anchor deep-links (design D4): `/$owner/$repo` renders the SAME aggregated home (not a
 * separate detail page) with the addressed repo's section present; an unknown id renders the home
 * unchanged with NO redirect and NO error (the scroll target is simply absent). The scroll-into-view
 * itself is a browser behaviour (Storybook test-runner / Playwright), not asserted in static markup.
 */
describe('app router — repo-anchor deep-links', () => {
  it('renders the repositories home with the addressed section for a cloned id', async () => {
    const router = createAppRouter({
      context: { client: pendingClient(), liveSessions: 0 },
      history: createMemoryHistory({ initialEntries: ['/acme-corp/web-client'] }),
    });

    const html = await renderWithRouter(router, {
      queryClient: seededClonedReposClient(TWO_REPOS),
    });

    expect(html).toContain('data-testid="repos-home"'); // the aggregated home, not a detail page
    expect(html).toContain('id="repo:acme-corp/web-client"'); // the addressed section is present
    expect(router.state.location.pathname).toBe('/acme-corp/web-client'); // no redirect
  });

  it('renders the home with no redirect or error for an unknown/un-cloned id', async () => {
    const router = createAppRouter({
      context: { client: pendingClient(), liveSessions: 0 },
      history: createMemoryHistory({ initialEntries: ['/openai/missing'] }),
    });

    const html = await renderWithRouter(router, {
      queryClient: seededClonedReposClient(TWO_REPOS),
    });

    expect(html).toContain('data-testid="repos-home"'); // the home still renders the cloned repos
    expect(html).not.toContain('id="repo:openai/missing"'); // no such section to scroll to
    expect(router.state.location.pathname).toBe('/openai/missing'); // rendered in place — no redirect
  });
});

/**
 * Active navigation (web-navigation "Active navigation reflects the current page", design D6): the
 * route marks exactly the current page's nav item active (`data-active="true"`, set via the `<Link>`
 * `activeProps` that also apply the visible accent). `data-active` is emitted only by our links, so a
 * count of `1`/`0` pins down exactly-one / none.
 */
function countActive(html: string): number {
  return html.split('data-active="true"').length - 1;
}

describe('app router — active navigation', () => {
  it('marks exactly the addressed repo link active on its deep-link route', async () => {
    const router = createAppRouter({
      context: { client: pendingClient(), liveSessions: 0 },
      history: createMemoryHistory({ initialEntries: ['/acme-corp/web-client'] }),
    });

    const html = await renderWithRouter(router, {
      queryClient: seededClonedReposClient(TWO_REPOS),
    });

    expect(countActive(html)).toBe(1); // only the current repo, not the other repo or New repository
    expect(html).toContain('data-testid="nav-repo:acme-corp/web-client"');
  });

  it('marks no nav item active on the home route', async () => {
    const router = createAppRouter({
      context: { client: pendingClient(), liveSessions: 0 },
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    const html = await renderWithRouter(router, {
      queryClient: seededClonedReposClient(TWO_REPOS),
    });

    expect(countActive(html)).toBe(0);
  });

  it('marks the New repository link active on /new-repo', async () => {
    const router = createAppRouter({
      context: { client: pendingClient(), liveSessions: 0 },
      history: createMemoryHistory({ initialEntries: ['/new-repo'] }),
    });

    const html = await renderWithRouter(router, {
      queryClient: seededClonedReposClient(TWO_REPOS),
    });

    expect(countActive(html)).toBe(1); // the New repository link, no repo link
  });
});
