import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import previewAnnotations from '../../.storybook/preview';
import type { RepoTarget } from '@switchboard/shared';
import type { SwitchboardClient } from '../api/client';
import { AppProviders } from '../providers/AppProviders';
import { sessionLivenessQueryKey } from '../sessions/session-queries';
import { AppShell } from './AppShell';
import * as stories from './AppShell.stories';

/**
 * Flat app-shell chrome (repos-home-and-sidebar). We render the COMPOSED story (real providers via
 * the global preview decorator) to static markup and assert the persistent chrome — tracked
 * wordmark, brand plug, burger, live-session count — plus the new home wiring: the navbar renders
 * `ReposNav` and the main region renders the repositories home (which, with no fetch resolved under
 * static rendering, shows its loading affordance). The retired "Line status" card must be gone. The
 * responsive drawer↔rail behaviour and dark resolution are asserted in the browser by the
 * Mobile / Desktop / Dark stories under the test-runner; the populated home / sidebar and the
 * deep-link scroll are covered by the `ReposHomeView` / `ReposNav` stories and the interaction test.
 */
setProjectAnnotations(previewAnnotations);

const { Default } = composeStories(stories);

describe('AppShell flat header', () => {
  it('renders the persistent chrome with the repositories home and ReposNav', () => {
    const html = renderToStaticMarkup(<Default />);
    expect(html).toContain('data-testid="app-shell"');
    expect(html).toContain('Switchboard');
    expect(html).toContain('data-testid="nav-burger"');
    expect(html).toContain('data-testid="brand-mark"');
    expect(html).toContain('data-testid="live-session-count"');
    // Navbar renders the per-organisation sidebar navigation with its "New repository" action.
    expect(html).toContain('data-testid="nav-rail"');
    expect(html).toContain('data-testid="repos-nav"');
    expect(html).toContain('data-testid="nav-new-repository"');
    // Main region renders the repositories home (initial loading affordance under static render).
    expect(html).toContain('data-testid="repos-home-loading"');
    // The retired "Line status" card is gone, and so is the old "Worktrees" nav entry.
    expect(html).not.toContain('data-testid="line-status"');
    expect(html).not.toContain('data-testid="nav-worktrees"');
  });

  it('shows the live session count', () => {
    const html = renderToStaticMarkup(<Default liveSessions={3} />);
    expect(html).toContain('3 live');
  });
});

/**
 * Header live-session count derives from real liveness (fix-live-session-indicator). With no
 * injected `liveSessions` prop, the header must reflect the AGGREGATE of every cloned repository's
 * live sessions — not the old hardcoded `0`. We seed the shared TanStack Query cache (the
 * `['cloned-repos']` list and each repo's `sessionLivenessQueryKey` set) so the server render
 * resolves the queries synchronously, then assert the rendered count. The injected `client` is
 * never called — the cache is pre-seeded.
 */
describe('AppShell header live-session count (derived)', () => {
  const REPOS: RepoTarget[] = [
    { owner: 'acme', repo: 'infra' },
    { owner: 'nick-boey', repo: 'switchboard' },
  ];
  const fakeClient = {} as SwitchboardClient;

  function seededClient(live: Record<string, Set<string>>): QueryClient {
    const qc = new QueryClient();
    qc.setQueryData(['cloned-repos'], { repos: REPOS });
    for (const [repoId, set] of Object.entries(live)) {
      qc.setQueryData(sessionLivenessQueryKey(repoId), set);
    }
    return qc;
  }

  it('reflects the aggregate live-session count across repositories, not a hardcoded 0', () => {
    const qc = seededClient({
      'acme/infra': new Set(['a--0123456789ab', 'b--abcdef012345']),
      'nick-boey/switchboard': new Set(['c--1']),
    });
    const html = renderToStaticMarkup(
      <AppProviders queryClient={qc}>
        <AppShell client={fakeClient} />
      </AppProviders>,
    );
    expect(html).toContain('data-testid="live-session-count"');
    expect(html).toContain('3 live sessions');
    expect(html).not.toContain('0 live sessions');
  });

  // Self-correction (the count UPDATES on the next liveness read of an already-mounted shell) needs a
  // live DOM with subscriptions — covered by the mounted jsdom test in
  // `AppShell.live-session-count.dom.test.tsx`, not a static server render.
});
