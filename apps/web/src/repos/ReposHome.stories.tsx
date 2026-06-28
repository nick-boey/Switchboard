import type { Meta, StoryObj } from '@storybook/react-vite';
import { toRepoId, type RepoTarget } from '@switchboard/shared';
import { schemeTest, VIEWPORTS } from '../storybook/scheme-test';
import { groupReposByOrg } from './group-repos';
import { ReposHomeView } from './ReposHome';

/**
 * Production stories for the presentational repositories home (task 3.1). Rendered against static
 * grouped fixtures (the container's `['cloned-repos']` wiring is covered by the E2E), exercising the
 * four list states — populated, empty, loading, and error — plus desktop and dark. The worktree
 * subtree is delegated to a render-prop; here it renders a placeholder slot, and the real container
 * renders the actual `<Worktrees>` per repository.
 */
const meta = {
  title: 'Repos/Repositories home',
  component: ReposHomeView,
} satisfies Meta<typeof ReposHomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Deliberately unsorted so the stories exercise the org-then-repo sort in `groupReposByOrg`. */
const REPOS: RepoTarget[] = [
  { owner: 'nick-boey', repo: 'switchboard' },
  { owner: 'acme-corp', repo: 'web-client' },
  { owner: 'openai', repo: 'codex' },
  { owner: 'acme-corp', repo: 'billing-api' },
  { owner: 'nick-boey', repo: 'dotfiles' },
];

const noop = (): void => {};

/** A placeholder worktree slot — the production container renders the real `<Worktrees>` here. */
const renderWorktrees = (target: RepoTarget) => (
  <div data-testid={`wt-slot:${toRepoId(target)}`}>worktrees for {toRepoId(target)}</div>
);

const baseArgs = { onNewRepository: noop, onRetry: noop, renderWorktrees };

/** Populated — several organisations, multiple repos each, worktrees inline. */
export const Populated: Story = {
  args: { status: 'ready', groups: groupReposByOrg(REPOS), ...baseArgs },
};

/** Empty — nothing cloned: the clone call-to-action. */
export const Empty: Story = {
  args: { status: 'ready', groups: [], ...baseArgs },
};

/** Loading — the cloned-repositories list is still loading. */
export const Loading: Story = {
  args: { status: 'loading', groups: [], ...baseArgs },
};

/** Error — the cloned-repositories query failed; a retryable message, distinct from empty. */
export const Failed: Story = {
  args: { status: 'error', groups: [], ...baseArgs },
};

/** Desktop — the aggregated page at a wide viewport. */
export const Desktop: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.desktop }),
  args: { status: 'ready', groups: groupReposByOrg(REPOS), ...baseArgs },
};

/** Dark — the page resolves the dark scheme. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.desktop }),
  args: { status: 'ready', groups: groupReposByOrg(REPOS), ...baseArgs },
};
