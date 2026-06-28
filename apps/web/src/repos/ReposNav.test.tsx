import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import previewAnnotations from '../../.storybook/preview';
import * as stories from './ReposNav.stories';

/**
 * Structure cover for the presentational sidebar navigation (task 4.1). We render the COMPOSED
 * stories to static markup and assert: one subheading per organisation with one deep-link button per
 * repository in the shared org-then-repo order; the bottom "New repository" action; and the empty
 * rail (no groups) showing only "New repository" with no subheadings or repository buttons.
 */
setProjectAnnotations(previewAnnotations);

const { Populated, Empty } = composeStories(stories);

/** Org subheadings in the order `groupReposByOrg` yields. */
const ORDERED_OWNERS = ['acme-corp', 'nick-boey', 'openai'];
/** Repo-ids in the order `groupReposByOrg` yields (org-then-repo, case-insensitive). */
const ORDERED_IDS = [
  'acme-corp/billing-api',
  'acme-corp/web-client',
  'nick-boey/dotfiles',
  'nick-boey/switchboard',
  'openai/codex',
];

describe('ReposNav (structure)', () => {
  it('renders an org subheading and one deep-link button per repository in shared order', () => {
    const html = renderToStaticMarkup(<Populated />);
    for (const owner of ORDERED_OWNERS) {
      expect(html).toContain(`data-testid="nav-org:${owner}"`);
    }
    for (const id of ORDERED_IDS) {
      expect(html).toContain(`data-testid="nav-repo:${id}"`);
    }
    const repoPositions = ORDERED_IDS.map((id) => html.indexOf(`data-testid="nav-repo:${id}"`));
    expect(repoPositions).toEqual([...repoPositions].sort((a, b) => a - b));
  });

  it('places the "New repository" action at the bottom of the rail', () => {
    const html = renderToStaticMarkup(<Populated />);
    expect(html).toContain('data-testid="nav-new-repository"');
    const lastRepo = Math.max(
      ...ORDERED_IDS.map((id) => html.indexOf(`data-testid="nav-repo:${id}"`)),
    );
    expect(html.indexOf('data-testid="nav-new-repository"')).toBeGreaterThan(lastRepo);
  });

  it('shows only the "New repository" action when there are no groups', () => {
    const html = renderToStaticMarkup(<Empty />);
    expect(html).toContain('data-testid="nav-new-repository"');
    expect(html).not.toContain('data-testid="nav-repo:');
    expect(html).not.toContain('data-testid="nav-org:');
  });
});
