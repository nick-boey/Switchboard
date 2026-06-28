import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RepoTarget } from '@switchboard/shared';
import { schemeTest, VIEWPORTS } from '../storybook/scheme-test';
import { groupReposByOrg } from './group-repos';
import { ReposNav } from './ReposNav';

/**
 * Production stories for the presentational sidebar navigation (task 4.1). `ReposNav` is
 * groups-driven: it renders one subheading per organisation with one deep-link button per repository
 * (shared org-then-repo order) plus a bottom "New repository" action. Empty groups (the empty list,
 * and — via `AppShell` — the loading/failed list) collapse to a rail showing only "New repository".
 */
const meta = {
  title: 'Repos/Repositories nav',
  component: ReposNav,
} satisfies Meta<typeof ReposNav>;

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
const baseArgs = { onSelectRepo: noop, onNewRepository: noop };

const Rail = ({ children }: { children: React.ReactNode }) => (
  <Box w={240} p="md" style={{ minHeight: 320 }}>
    {children}
  </Box>
);

/** Populated — per-organisation subheadings with one deep-link button per repository. */
export const Populated: Story = {
  args: { groups: groupReposByOrg(REPOS), ...baseArgs },
  render: (args) => (
    <Rail>
      <ReposNav {...args} />
    </Rail>
  ),
};

/** Empty — nothing cloned: only the "New repository" action. */
export const Empty: Story = {
  args: { groups: [], ...baseArgs },
  render: (args) => (
    <Rail>
      <ReposNav {...args} />
    </Rail>
  ),
};

/** Dark — the rail resolves the dark scheme. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.desktop }),
  args: { groups: groupReposByOrg(REPOS), ...baseArgs },
  render: (args) => (
    <Rail>
      <ReposNav {...args} />
    </Rail>
  ),
};
