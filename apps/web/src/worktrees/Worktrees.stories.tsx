import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { WorktreeSummary } from '@switchboard/shared';
import { schemeTest, VIEWPORTS } from '../storybook/scheme-test';
import { WorktreesView } from './WorktreesView';
import { CreateWorktreeModal } from './CreateWorktreeModal';

/**
 * Production stories for the worktrees-hub worktree slice (task 7.1): the list (with git lamp),
 * empty, loading, and error states; the create-worktree modal; and the delete control's safe vs
 * not-safe styling. In the MVP no worktree is auto-safe (prMerged has no source), so the lit
 * styling is shown only via the explicitly-merged fixture for visual coverage. Mobile + desktop,
 * both colour schemes; the polling/mutation wiring is covered by the container's E2E.
 */
const meta = { title: 'Worktrees/Hub' } satisfies Meta;
export default meta;
type Story = StoryObj;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <Box p="md" maw={560} mx="auto" w="100%">
    {children}
  </Box>
);

const sample: WorktreeSummary[] = [
  {
    wtId: 'feature-remote-control--0123456789ab',
    branch: 'feature/remote-control',
    path: 'repos/nick-boey/switchboard/worktrees/feature-remote-control--0123456789ab',
    dirty: true,
    sync: 'ahead',
  },
  {
    wtId: 'fix-clone-retry--abcdef012345',
    branch: 'fix/clone-retry',
    path: 'repos/nick-boey/switchboard/worktrees/fix-clone-retry--abcdef012345',
    dirty: false,
    sync: 'behind',
  },
];

export const List: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <WorktreesView repoId="nick-boey/switchboard" worktrees={sample} />
    </Frame>
  ),
};

export const Empty: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <WorktreesView repoId="nick-boey/switchboard" worktrees={[]} />
    </Frame>
  ),
};

export const Loading: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <WorktreesView repoId="nick-boey/switchboard" worktrees={undefined} />
    </Frame>
  ),
};

export const ErrorState: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <WorktreesView repoId="nick-boey/switchboard" worktrees={undefined} isError />
    </Frame>
  ),
};

/** The delete control lit — reachable only once a PR source sets prMerged (dormant in the MVP). */
export const SafeToDelete: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <WorktreesView
        repoId="nick-boey/switchboard"
        worktrees={[{ ...sample[1], dirty: false, prMerged: true }]}
      />
    </Frame>
  ),
};

export const CreateModal: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <CreateWorktreeModal
        repoId="nick-boey/switchboard"
        existingBranches={['main', 'develop', 'release/1.0']}
        baseBranches={['main', 'develop']}
      />
    </Frame>
  ),
};

export const Desktop: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.desktop }),
  render: () => (
    <Frame>
      <WorktreesView repoId="nick-boey/switchboard" worktrees={sample} />
    </Frame>
  ),
};

export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <WorktreesView repoId="nick-boey/switchboard" worktrees={sample} />
    </Frame>
  ),
};
