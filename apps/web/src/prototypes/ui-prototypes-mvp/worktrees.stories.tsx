import {
  Box,
  Button,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  AppFrame,
  DeviceFrame,
  EmbossedLabel,
  IndicatorLamp,
  OperationLedger,
  Panel,
  type Operation,
} from './kit';

/**
 * Screen 2 of the MVP flow — list a cloned repo's worktrees and create a new one, branching from a
 * new or existing branch (confirms the `worktree-management` change). Mobile-first with a desktop
 * variant; renders empty (only `main`), in-progress (a create running through the ledger, line
 * locked), and error (create failed) states. Static fake data only.
 */

interface Worktree {
  branch: string;
  path: string;
  /** 'clean', or a short dirty summary like '3 changes'. */
  status: string;
  /** Whether a `claude --remote-control` session is live on this worktree. */
  session: boolean;
}

const REPO = 'switchboard';

function WorktreeRow({ wt, divider }: { wt: Worktree; divider: boolean }) {
  const dirty = wt.status !== 'clean';
  return (
    <Box
      py={10}
      px={6}
      style={{ borderTop: divider ? '1px solid rgba(120,90,40,0.18)' : undefined }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8} wrap="nowrap">
            <Text fz="sm" fw={700} ff="monospace" truncate>
              {wt.branch}
            </Text>
            {wt.session && (
              <Group gap={4} wrap="nowrap">
                <IndicatorLamp color="patina" lit size={9} label="session live" />
                <Text
                  fz={10}
                  c="patina.7"
                  fw={700}
                  tt="uppercase"
                  style={{ letterSpacing: '0.08em' }}
                >
                  live
                </Text>
              </Group>
            )}
          </Group>
          <Text fz="xs" c="dimmed" ff="monospace" truncate>
            {wt.path}
          </Text>
          <Group gap={6} mt={4} wrap="nowrap">
            <IndicatorLamp color={dirty ? 'brass' : 'patina'} lit={dirty} size={9} />
            <Text fz="xs" c="dimmed">
              {wt.status}
            </Text>
          </Group>
        </Box>
        <Box style={{ flex: 'none' }}>
          <Button size="xs" variant={wt.session ? 'default' : 'filled'}>
            {wt.session ? 'Open' : 'Launch →'}
          </Button>
        </Box>
      </Group>
    </Box>
  );
}

function CreateWorktree({ locked = false }: { locked?: boolean }) {
  return (
    <Panel>
      <EmbossedLabel>Create worktree</EmbossedLabel>
      <Stack gap="sm" mt="sm">
        <SegmentedControl
          fullWidth
          size="sm"
          defaultValue="new"
          data={[
            { label: 'New branch', value: 'new' },
            { label: 'Existing branch', value: 'existing' },
          ]}
        />
        <TextInput
          size="sm"
          label="Branch name"
          placeholder="feature/remote-control"
          defaultValue=""
        />
        <Select
          size="sm"
          label="Base branch"
          defaultValue="main"
          data={['main', 'develop', 'release/1.0']}
          comboboxProps={{ withinPortal: false }}
        />
        <Button disabled={locked}>{locked ? 'Line busy…' : 'Create worktree'}</Button>
      </Stack>
    </Panel>
  );
}

interface ScreenProps {
  worktrees: Worktree[];
  ledger?: Operation[];
  locked?: boolean;
  desktop?: boolean;
}

function Worktrees({ worktrees, ledger, locked = false, desktop = false }: ScreenProps) {
  const status = (
    <Group gap={8} wrap="nowrap">
      <IndicatorLamp color="brass" lit size={11} label="repo" />
      <Text fz="xs" fw={600} ff="monospace">
        {REPO}
      </Text>
    </Group>
  );

  const context = (
    <Panel pressed p="xs">
      <Group gap={8} wrap="nowrap">
        <Text fz="xs" c="dimmed">
          ‹ Repositories
        </Text>
        <Text fz="xs" c="dimmed">
          /
        </Text>
        <Text fz="sm" fw={700} ff="monospace">
          {REPO}
        </Text>
      </Group>
    </Panel>
  );

  const list = (
    <Panel>
      <Group justify="space-between" align="center">
        <EmbossedLabel>Worktrees</EmbossedLabel>
        <Text fz="xs" c="dimmed">
          {worktrees.length} active
        </Text>
      </Group>
      {worktrees.length <= 1 ? (
        <Panel pressed mt="sm">
          <Stack gap={4} align="center" py="lg">
            <IndicatorLamp color="patina" size={16} label="no worktrees" />
            <Text fz="sm" fw={600}>
              Only{' '}
              <Text span ff="monospace">
                main
              </Text>{' '}
              so far
            </Text>
            <Text fz="xs" c="dimmed" ta="center" maw={260}>
              Create a worktree to run an isolated session without disturbing your checkout.
            </Text>
          </Stack>
        </Panel>
      ) : (
        <Panel pressed p="xs" mt="sm">
          <Stack gap={0}>
            {worktrees.map((wt, i) => (
              <WorktreeRow key={wt.branch} wt={wt} divider={i > 0} />
            ))}
          </Stack>
        </Panel>
      )}
    </Panel>
  );

  return (
    <AppFrame status={status}>
      <Stack gap="md">
        {context}
        {ledger && <OperationLedger ops={ledger} locked={locked} />}
        {desktop ? (
          <SimpleGrid cols={2} spacing="md">
            {list}
            <CreateWorktree locked={locked} />
          </SimpleGrid>
        ) : (
          <>
            {list}
            <CreateWorktree locked={locked} />
          </>
        )}
      </Stack>
    </AppFrame>
  );
}

const MAIN: Worktree = {
  branch: 'main',
  path: '~/repos/switchboard',
  status: 'clean',
  session: false,
};
const FEATURE: Worktree = {
  branch: 'feature/remote-control',
  path: '.worktrees/feature-remote-control',
  status: '3 changes',
  session: true,
};
const FIX: Worktree = {
  branch: 'fix/clone-retry',
  path: '.worktrees/fix-clone-retry',
  status: 'clean',
  session: false,
};

const meta = {
  ...definePrototypeMeta({
    component: Worktrees,
    parameters: { layout: 'fullscreen' },
  }),
} satisfies Meta<typeof Worktrees>;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = 390;
const DESKTOP = 1120;

function Frame({ width, children }: { width: number; children: ReactNode }) {
  return (
    <Box
      p="lg"
      style={{
        display: 'flex',
        justifyContent: 'center',
        background: 'var(--mantine-color-default)',
      }}
    >
      <DeviceFrame width={width}>{children}</DeviceFrame>
    </Box>
  );
}

/** Empty — only `main` exists; the create panel is the call to action. */
export const Mobile: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Worktrees worktrees={[MAIN]} />
    </Frame>
  ),
};

/** In-progress — a worktree create running through the ledger; line locked. */
export const MobileCreating: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Worktrees
        worktrees={[MAIN, FEATURE]}
        locked
        ledger={[
          {
            id: 'op-wt-create',
            label: 'Create worktree fix/clone-retry',
            status: 'running',
            detail: 'checking out from main',
            progress: undefined,
          },
        ]}
      />
    </Frame>
  ),
};

/** Error — create failed because the branch already exists. */
export const MobileError: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Worktrees
        worktrees={[MAIN, FEATURE]}
        ledger={[
          {
            id: 'op-wt-create',
            label: 'Create worktree feature/remote-control',
            status: 'failed',
            detail: "fatal: a branch named 'feature/remote-control' already exists",
          },
        ]}
      />
    </Frame>
  ),
};

/** Desktop variant — list and create side by side, with a populated worktree list. */
export const Desktop: Story = {
  render: () => (
    <Frame width={DESKTOP}>
      <Worktrees worktrees={[MAIN, FEATURE, FIX]} desktop />
    </Frame>
  ),
};
