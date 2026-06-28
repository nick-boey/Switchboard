import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import previewAnnotations from '../../.storybook/preview';
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
