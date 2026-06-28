import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import previewAnnotations from '../../.storybook/preview';
import * as stories from './ReposHome.stories';

/**
 * Structure cover for the presentational repositories home (task 3.1). We render the COMPOSED
 * stories (real providers via the global preview decorator) to static markup and assert: every repo
 * present and grouped in organisation-then-repo order, the collision-proof `repoAnchorId` per
 * section, an inline worktree slot per section, the empty clone CTA, and the two degraded states —
 * loading (affordance, not the empty CTA) and error (retryable, distinct from empty).
 */
setProjectAnnotations(previewAnnotations);

const { Populated, Empty, Loading, Failed } = composeStories(stories);

/** Repo-ids in the order `groupReposByOrg` should yield (org-then-repo, case-insensitive). */
const ORDERED_IDS = [
  'acme-corp/billing-api',
  'acme-corp/web-client',
  'nick-boey/dotfiles',
  'nick-boey/switchboard',
  'openai/codex',
];

describe('ReposHomeView (structure)', () => {
  it('renders every repository, anchored and grouped in org-then-repo order, with inline worktrees', () => {
    const html = renderToStaticMarkup(<Populated />);
    for (const id of ORDERED_IDS) {
      expect(html).toContain(`id="repo:${id}"`);
      expect(html).toContain(`data-testid="wt-slot:${id}"`);
    }
    // Sections appear in the grouped order (anchor positions are monotonically increasing).
    const positions = ORDERED_IDS.map((id) => html.indexOf(`id="repo:${id}"`));
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
    expect(html).not.toContain('data-testid="repos-home-empty"');
  });

  it('shows the clone call-to-action when the resolved list is empty', () => {
    const html = renderToStaticMarkup(<Empty />);
    expect(html).toContain('data-testid="repos-home-empty"');
    expect(html).toContain('data-testid="repos-home-clone"');
  });

  it('shows a loading affordance and not the empty CTA while loading', () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('data-testid="repos-home-loading"');
    expect(html).not.toContain('data-testid="repos-home-empty"');
    expect(html).not.toContain('data-testid="repos-home-clone"');
  });

  it('shows a retryable error distinct from the empty state on failure', () => {
    const html = renderToStaticMarkup(<Failed />);
    expect(html).toContain('data-testid="repos-home-error"');
    expect(html).toContain('data-testid="repos-home-retry"');
    expect(html).not.toContain('data-testid="repos-home-empty"');
    // The error must not read as the empty state.
    expect(html.toLowerCase()).not.toContain('no repositories cloned');
  });
});
