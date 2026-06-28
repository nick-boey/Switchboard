import { describe, expect, it } from 'vitest';
import type { RepoTarget } from '@switchboard/shared';
import { renderWithRouter, stubLinkRouter } from '../router/test-router';
import { groupReposByOrg, type RepoOrgGroup } from './group-repos';
import { ReposNav } from './ReposNav';

/**
 * Structure cover for the presentational sidebar navigation. `ReposNav`'s repo links are now typed
 * router `<Link>`s, so it is mounted under a stub link-router (which declares the app's link-target
 * paths) and rendered to static markup via the harness. We assert: one subheading per organisation
 * with one deep-link per repository in the shared org-then-repo order; the bottom "New repository"
 * action; and the empty rail (no groups) showing only "New repository".
 */

/** Deliberately unsorted so the cover exercises the org-then-repo sort in `groupReposByOrg`. */
const REPOS: RepoTarget[] = [
  { owner: 'nick-boey', repo: 'switchboard' },
  { owner: 'acme-corp', repo: 'web-client' },
  { owner: 'openai', repo: 'codex' },
  { owner: 'acme-corp', repo: 'billing-api' },
  { owner: 'nick-boey', repo: 'dotfiles' },
];
const ORDERED_OWNERS = ['acme-corp', 'nick-boey', 'openai'];
const ORDERED_IDS = [
  'acme-corp/billing-api',
  'acme-corp/web-client',
  'nick-boey/dotfiles',
  'nick-boey/switchboard',
  'openai/codex',
];

function navHtml(groups: RepoOrgGroup[]): Promise<string> {
  return renderWithRouter(stubLinkRouter(<ReposNav groups={groups} />));
}

describe('ReposNav (structure)', () => {
  it('renders an org subheading and one deep-link per repository in shared order', async () => {
    const html = await navHtml(groupReposByOrg(REPOS));
    for (const owner of ORDERED_OWNERS) {
      expect(html).toContain(`data-testid="nav-org:${owner}"`);
    }
    for (const id of ORDERED_IDS) {
      expect(html).toContain(`data-testid="nav-repo:${id}"`);
    }
    const repoPositions = ORDERED_IDS.map((id) => html.indexOf(`data-testid="nav-repo:${id}"`));
    expect(repoPositions).toEqual([...repoPositions].sort((a, b) => a - b));
    // Each repo link is a real anchor to its clean deep-link path.
    expect(html).toContain('href="/nick-boey/switchboard"');
  });

  it('places the "New repository" action at the bottom of the rail', async () => {
    const html = await navHtml(groupReposByOrg(REPOS));
    expect(html).toContain('data-testid="nav-new-repository"');
    expect(html).toContain('href="/new-repo"');
    const lastRepo = Math.max(
      ...ORDERED_IDS.map((id) => html.indexOf(`data-testid="nav-repo:${id}"`)),
    );
    expect(html.indexOf('data-testid="nav-new-repository"')).toBeGreaterThan(lastRepo);
  });

  it('shows only the "New repository" action when there are no groups', async () => {
    const html = await navHtml([]);
    expect(html).toContain('data-testid="nav-new-repository"');
    expect(html).not.toContain('data-testid="nav-repo:');
    expect(html).not.toContain('data-testid="nav-org:');
  });
});
