import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import type { RepoListResponse } from '@switchboard/shared';
import { switchboardTheme } from '../theme/theme';
import { NewRepositoryView } from './NewRepository';

/**
 * Structure cover for the New repository screen (task 8.1). Interaction/responsiveness/scheme are
 * asserted in the browser by the stories; here the node suite pins the ported structure: Local
 * disabled, the owner/repository selectors, the From-URL preview (with `.git` normalized), the
 * Clone enable/disable gating for both happy paths, and the unconfigured empty state.
 */
const render = (ui: ReactNode): string =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);

/** The opening `<button>` tag carrying the given data-testid (for disabled assertions). */
function buttonTag(html: string, testid: string): string {
  const m = html.match(new RegExp(`<button[^>]*data-testid="${testid}"[^>]*>`));
  if (!m) throw new Error(`no button with data-testid="${testid}"`);
  return m[0];
}

const listing: RepoListResponse = {
  status: 'ok',
  owners: [
    { login: 'nick-boey', kind: 'user' },
    { login: 'acme', kind: 'organisation' },
  ],
  repositories: [
    { owner: 'nick-boey', name: 'switchboard' },
    { owner: 'acme', name: 'widget-factory' },
  ],
};

describe('New repository screen (structure)', () => {
  it('offers a GitHub/Local source toggle with Local disabled', () => {
    const html = render(<NewRepositoryView listing={listing} />);
    const local = html.match(/<button[^>]*>Local<\/button>/)?.[0] ?? html;
    expect(html).toContain('GitHub');
    expect(local).toContain('disabled');
  });

  it('renders the owner and repository selectors for the ok listing', () => {
    const html = render(<NewRepositoryView listing={listing} />);
    expect(html).toContain('data-testid="owner-input"');
    expect(html).toContain('data-testid="repo-input"');
  });

  it('previews the parsed owner/repo from a URL with a normalized .git', () => {
    const html = render(
      <NewRepositoryView
        listing={listing}
        initialMethod="url"
        initialUrl="https://github.com/acme/widget-factory.git"
      />,
    );
    expect(html).toContain('acme/widget-factory');
    // The preview shows the normalized id, not the `.git` suffix.
    expect(html).not.toContain('widget-factory.git<');
  });

  it('enables Clone for a valid personal-account selection', () => {
    const html = render(
      <NewRepositoryView listing={listing} initialOwner="nick-boey" initialRepo="switchboard" />,
    );
    expect(buttonTag(html, 'clone-button')).not.toContain('disabled');
  });

  it('enables Clone for a valid organisation selection', () => {
    const html = render(
      <NewRepositoryView listing={listing} initialOwner="acme" initialRepo="widget-factory" />,
    );
    expect(buttonTag(html, 'clone-button')).not.toContain('disabled');
  });

  it('keeps Clone disabled until both owner and repository resolve', () => {
    const html = render(<NewRepositoryView listing={listing} initialOwner="nick-boey" />);
    expect(buttonTag(html, 'clone-button')).toContain('disabled');
  });

  it('shows the unconfigured empty state prompting to add a PAT', () => {
    const html = render(<NewRepositoryView listing={{ status: 'not-configured' }} />);
    expect(html).toContain('data-testid="github-unconfigured"');
    expect(html.toLowerCase()).toContain('not configured');
    expect(html).toContain('~/.switchboard');
  });
});
