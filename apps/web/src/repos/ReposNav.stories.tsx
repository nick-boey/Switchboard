import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RepoTarget } from '@switchboard/shared';
import { schemeTest, VIEWPORTS } from '../storybook/scheme-test';
import { StubRouterStory } from '../router/story-router';
import { groupReposByOrg } from './group-repos';
import { ReposNav } from './ReposNav';

/**
 * Production stories for the presentational sidebar navigation. `ReposNav` is groups-driven: one
 * subheading per organisation with one typed router `Link` per repository (shared org-then-repo
 * order) plus a bottom "New repository" `Link`. Mounted under `StubRouterStory` so the `Link`s
 * resolve their hrefs. Empty groups (the empty list, and — via `AppShell` — the loading/failed list)
 * collapse to a rail showing only "New repository".
 */
const meta = {
  title: 'Repos/Repositories nav',
  component: ReposNav,
  render: (args) => (
    <StubRouterStory>
      <Box w={240} p="md" style={{ minHeight: 320 }}>
        <ReposNav {...args} />
      </Box>
    </StubRouterStory>
  ),
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

/** Populated — per-organisation subheadings with one deep-link per repository. */
export const Populated: Story = {
  args: { groups: groupReposByOrg(REPOS) },
};

/** Empty — nothing cloned: only the "New repository" action. */
export const Empty: Story = {
  args: { groups: [] },
};

/** Dark — the rail resolves the dark scheme. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.desktop }),
  args: { groups: groupReposByOrg(REPOS) },
};
