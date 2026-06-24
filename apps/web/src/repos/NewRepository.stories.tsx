import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RepoListResponse } from '@switchboard/shared';
import { schemeTest, VIEWPORTS } from '../storybook/scheme-test';
import { NewRepositoryView } from './NewRepository';

/**
 * Production stories for the New repository screen (task 8.2): the GitHub source with Select vs
 * From URL, the unconfigured empty state, mobile + desktop, and dark. Render against an explicit
 * listing so the states are deterministic (the container's query wiring is covered by the E2E).
 */
const meta = { title: 'Repos/New repository' } satisfies Meta;
export default meta;
type Story = StoryObj;

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

const Frame = ({ children }: { children: React.ReactNode }) => <Box p="md">{children}</Box>;

/** Mobile — select an owner and repository. */
export const Mobile: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <NewRepositoryView listing={listing} initialOwner="nick-boey" />
    </Frame>
  ),
};

/** Desktop — the same guided flow, centred. */
export const Desktop: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.desktop }),
  render: () => (
    <Frame>
      <NewRepositoryView listing={listing} initialOwner="acme" initialRepo="widget-factory" />
    </Frame>
  ),
};

/** From URL — paste a URL (with a normalized `.git`) and preview the target. */
export const FromUrl: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <NewRepositoryView
        listing={listing}
        initialMethod="url"
        initialUrl="https://github.com/acme/widget-factory.git"
      />
    </Frame>
  ),
};

/** Unconfigured — no PAT present; prompt to add one to ~/.switchboard. */
export const Unconfigured: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <NewRepositoryView listing={{ status: 'not-configured' }} />
    </Frame>
  ),
};

/** Dark — the screen resolves the dark scheme. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <NewRepositoryView listing={listing} initialOwner="acme" initialRepo="widget-factory" />
    </Frame>
  ),
};
