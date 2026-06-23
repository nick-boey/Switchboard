import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import type { WorktreeSummary } from '@switchboard/shared';
import { switchboardTheme } from '../theme/theme';
import { WorktreesView } from './WorktreesView';
import { CreateWorktreeModal } from './CreateWorktreeModal';

/**
 * Structure cover (task 7.1) for the worktrees-hub worktree slice: the list (with git lamp),
 * empty, loading, and error states; the delete control's safe-to-delete styling and its
 * dormant-in-MVP behaviour (never lit when prMerged is unset); and the create modal's
 * validate-before-Create gating. Interaction/responsiveness/scheme are asserted by the stories.
 */
const render = (ui: ReactNode): string =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);

function buttonTag(html: string, testid: string): string {
  const m = html.match(new RegExp(`<button[^>]*data-testid="${testid}"[^>]*>`));
  if (!m) throw new Error(`no button with data-testid="${testid}"`);
  return m[0];
}

const wt = (over: Partial<WorktreeSummary>): WorktreeSummary => ({
  wtId: 'feature-x--0123456789ab',
  branch: 'feature/x',
  path: 'repos/acme/infra/worktrees/feature-x--0123456789ab',
  dirty: false,
  sync: 'up-to-date',
  ...over,
});

describe('WorktreesView (states)', () => {
  it('shows the loading state while the list is undefined', () => {
    const html = render(<WorktreesView repoId="acme/infra" worktrees={undefined} />);
    expect(html).toContain('data-testid="worktrees-loading"');
  });

  it('shows the error state with a retry', () => {
    const html = render(<WorktreesView repoId="acme/infra" worktrees={undefined} isError />);
    expect(html).toContain('data-testid="worktrees-error"');
    expect(html).toContain('data-testid="worktrees-retry"');
  });

  it('shows the empty state with only an Add worktree row', () => {
    const html = render(<WorktreesView repoId="acme/infra" worktrees={[]} />);
    expect(html).toContain('data-testid="worktrees-empty"');
    expect(html).toContain('data-testid="wt-add"');
    expect(html).not.toContain('data-testid="wt-row-');
  });

  it('renders a worktree row with its branch and git lamp', () => {
    const html = render(<WorktreesView repoId="acme/infra" worktrees={[wt({ sync: 'ahead' })]} />);
    expect(html).toContain('feature/x');
    // The git lamp reflects the sync state (its accessible label).
    expect(html).toContain('Git: ahead of remote');
    expect(html).toContain('data-testid="wt-add"');
  });

  it('keeps the delete control unlit in the MVP (no PR source → never safe)', () => {
    const html = render(<WorktreesView repoId="acme/infra" worktrees={[wt({})]} />);
    expect(buttonTag(html, 'wt-delete-feature-x--0123456789ab')).toContain('data-lit="false"');
  });

  it('lights the delete control once a worktree is safe (merged PR + clean)', () => {
    const html = render(
      <WorktreesView repoId="acme/infra" worktrees={[wt({ prMerged: true, dirty: false })]} />,
    );
    expect(buttonTag(html, 'wt-delete-feature-x--0123456789ab')).toContain('data-lit="true"');
  });

  it('does not light a dirty worktree even with a merged PR', () => {
    const html = render(
      <WorktreesView repoId="acme/infra" worktrees={[wt({ prMerged: true, dirty: true })]} />,
    );
    expect(buttonTag(html, 'wt-delete-feature-x--0123456789ab')).toContain('data-lit="false"');
  });
});

describe('CreateWorktreeModal (validate before Create)', () => {
  it('disables Create for an empty new-branch name', () => {
    const html = render(<CreateWorktreeModal repoId="acme/infra" />);
    expect(html).toContain('data-testid="create-worktree-modal"');
    expect(buttonTag(html, 'wt-create-button')).toContain('disabled');
  });

  it('enables Create for a valid new branch', () => {
    const html = render(<CreateWorktreeModal repoId="acme/infra" initialBranch="feature/new" />);
    expect(buttonTag(html, 'wt-create-button')).not.toContain('disabled');
  });

  it('enables Create for a chosen existing branch', () => {
    const html = render(
      <CreateWorktreeModal
        repoId="acme/infra"
        initialMode="existing-remote"
        existingBranches={['main', 'develop']}
        initialExistingBranch="develop"
      />,
    );
    expect(buttonTag(html, 'wt-create-button')).not.toContain('disabled');
  });

  it('disables Create for the existing mode with nothing selected', () => {
    const html = render(
      <CreateWorktreeModal
        repoId="acme/infra"
        initialMode="existing-remote"
        existingBranches={['main']}
      />,
    );
    expect(buttonTag(html, 'wt-create-button')).toContain('disabled');
  });
});
