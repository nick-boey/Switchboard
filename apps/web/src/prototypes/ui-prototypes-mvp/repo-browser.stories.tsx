import { Box, Button, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
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
 * Screen 1 of the MVP flow — browse GitHub repositories and clone one (confirms the
 * `repo-clone-browse` change). Sketched mobile-first with a desktop variant, and rendering the
 * three required states: empty (nothing cloned yet), in-progress (a clone running through the
 * operation ledger, line locked), and error (a clone that failed). Static fake data only.
 */

interface Repo {
  owner: string;
  name: string;
  description: string;
  lang: string;
  langColor: string;
  stars: number;
  updated: string;
}

const GITHUB_REPOS: Repo[] = [
  {
    owner: 'nick-boey',
    name: 'switchboard',
    description: 'Operator console for driving Claude sessions from your phone',
    lang: 'TypeScript',
    langColor: '#3178c6',
    stars: 128,
    updated: 'updated 2d ago',
  },
  {
    owner: 'acme',
    name: 'widget-factory',
    description: 'Reusable widget components and design tokens',
    lang: 'TypeScript',
    langColor: '#3178c6',
    stars: 54,
    updated: 'updated 5h ago',
  },
  {
    owner: 'octocat',
    name: 'Hello-World',
    description: 'My first repository on GitHub!',
    lang: 'JavaScript',
    langColor: '#f1e05a',
    stars: 1903,
    updated: 'updated 3w ago',
  },
  {
    owner: 'torvalds',
    name: 'linux',
    description: 'Linux kernel source tree',
    lang: 'C',
    langColor: '#555555',
    stars: 178000,
    updated: 'updated just now',
  },
];

function LangDot({ color }: { color: string }) {
  return (
    <Box
      style={{
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: color,
        border: '1px solid rgba(0,0,0,0.25)',
        flex: 'none',
      }}
    />
  );
}

function RepoRow({ repo, action, divider }: { repo: Repo; action: ReactNode; divider: boolean }) {
  return (
    <Box
      py={10}
      px={6}
      style={{ borderTop: divider ? '1px solid rgba(120,90,40,0.18)' : undefined }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fz="sm" truncate>
            <Text span c="dimmed">
              {repo.owner}/
            </Text>
            <Text span fw={700}>
              {repo.name}
            </Text>
          </Text>
          <Text fz="xs" c="dimmed" lineClamp={1}>
            {repo.description}
          </Text>
          <Group gap="md" mt={5} wrap="nowrap">
            <Group gap={5} wrap="nowrap">
              <LangDot color={repo.langColor} />
              <Text fz="xs" c="dimmed">
                {repo.lang}
              </Text>
            </Group>
            <Text fz="xs" c="dimmed">
              ★ {repo.stars.toLocaleString()}
            </Text>
            <Text fz="xs" c="dimmed">
              {repo.updated}
            </Text>
          </Group>
        </Box>
        <Box style={{ flex: 'none' }}>{action}</Box>
      </Group>
    </Box>
  );
}

interface ScreenProps {
  /** Names of repos already cloned (shown in the local panel + marked in the browse list). */
  cloned?: string[];
  /** Operation ledger rows. Omit for the clean empty state. */
  ledger?: Operation[];
  /** Line lock — disables clone actions and lights the LINE BUSY lamp. */
  locked?: boolean;
  /** Two-column desktop layout instead of the stacked mobile layout. */
  desktop?: boolean;
}

function RepoBrowser({ cloned = [], ledger, locked = false, desktop = false }: ScreenProps) {
  const clonedSet = new Set(cloned);
  const status = (
    <Group gap={8} wrap="nowrap">
      <IndicatorLamp color="patina" lit size={11} label="github connected" />
      <Text fz="xs" fw={600}>
        nick-boey
      </Text>
    </Group>
  );

  const browse = (
    <Panel>
      <EmbossedLabel>Your repositories · GitHub</EmbossedLabel>
      <TextInput mt="sm" size="sm" placeholder="Search repositories…" defaultValue="" />
      <Panel pressed p="xs" mt="sm">
        <Stack gap={0}>
          {GITHUB_REPOS.map((repo, i) => (
            <RepoRow
              key={`${repo.owner}/${repo.name}`}
              repo={repo}
              divider={i > 0}
              action={
                clonedSet.has(repo.name) ? (
                  <Group gap={6} wrap="nowrap">
                    <IndicatorLamp color="patina" lit size={10} label="cloned" />
                    <Text fz="xs" c="patina.7" fw={600}>
                      cloned
                    </Text>
                  </Group>
                ) : (
                  <Button size="xs" disabled={locked}>
                    {locked ? 'Queued' : 'Clone'}
                  </Button>
                )
              }
            />
          ))}
        </Stack>
      </Panel>
    </Panel>
  );

  const local = (
    <Panel>
      <EmbossedLabel>Cloned · ready to patch through</EmbossedLabel>
      {cloned.length === 0 ? (
        <Panel pressed mt="sm">
          <Stack gap={4} align="center" py="lg">
            <IndicatorLamp color="patina" size={16} label="no repositories" />
            <Text fz="sm" fw={600}>
              No repositories cloned yet
            </Text>
            <Text fz="xs" c="dimmed" ta="center" maw={260}>
              Clone one from the list to open its worktrees and launch a session.
            </Text>
          </Stack>
        </Panel>
      ) : (
        <Panel pressed p="xs" mt="sm">
          <Stack gap={0}>
            {cloned.map((name, i) => (
              <Box
                key={name}
                py={10}
                px={6}
                style={{ borderTop: i > 0 ? '1px solid rgba(120,90,40,0.18)' : undefined }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap={8} wrap="nowrap">
                    <IndicatorLamp color="patina" lit size={11} label="ready" />
                    <Text fz="sm" fw={700}>
                      {name}
                    </Text>
                  </Group>
                  <Button size="xs" variant="default">
                    Worktrees →
                  </Button>
                </Group>
              </Box>
            ))}
          </Stack>
        </Panel>
      )}
    </Panel>
  );

  return (
    <AppFrame status={status}>
      <Stack gap="md">
        {ledger && <OperationLedger ops={ledger} locked={locked} />}
        {desktop ? (
          <SimpleGrid cols={2} spacing="md">
            {browse}
            {local}
          </SimpleGrid>
        ) : (
          <>
            {browse}
            {local}
          </>
        )}
      </Stack>
    </AppFrame>
  );
}

const meta = {
  ...definePrototypeMeta({
    component: RepoBrowser,
    parameters: { layout: 'fullscreen' },
  }),
} satisfies Meta<typeof RepoBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = 390;
const DESKTOP = 1120;

/** Empty — first run, nothing cloned. Browse list ready, local panel shows the empty placeholder. */
export const Mobile: Story = {
  render: () => (
    <Box
      p="lg"
      style={{
        display: 'flex',
        justifyContent: 'center',
        background: 'var(--mantine-color-default)',
      }}
    >
      <DeviceFrame width={PHONE}>
        <RepoBrowser cloned={[]} />
      </DeviceFrame>
    </Box>
  ),
};

/** In-progress — a clone running through the ledger; the line is locked so other clones queue. */
export const MobileCloning: Story = {
  render: () => (
    <Box
      p="lg"
      style={{
        display: 'flex',
        justifyContent: 'center',
        background: 'var(--mantine-color-default)',
      }}
    >
      <DeviceFrame width={PHONE}>
        <RepoBrowser
          cloned={['switchboard']}
          locked
          ledger={[
            {
              id: 'op-clone-wf',
              label: 'Clone acme/widget-factory',
              status: 'running',
              detail: 'Receiving objects · 62%',
              progress: 62,
            },
            {
              id: 'op-clone-sb',
              label: 'Clone nick-boey/switchboard',
              status: 'done',
              detail: 'cloned to ~/repos/switchboard',
            },
          ]}
        />
      </DeviceFrame>
    </Box>
  ),
};

/** Error — a clone failed (auth). The line is released; the failed op stays in the ledger to retry. */
export const MobileError: Story = {
  render: () => (
    <Box
      p="lg"
      style={{
        display: 'flex',
        justifyContent: 'center',
        background: 'var(--mantine-color-default)',
      }}
    >
      <DeviceFrame width={PHONE}>
        <RepoBrowser
          cloned={['switchboard']}
          ledger={[
            {
              id: 'op-clone-linux',
              label: 'Clone torvalds/linux',
              status: 'failed',
              detail: 'authentication failed — check your GitHub token in ~/.switchboard',
            },
          ]}
        />
      </DeviceFrame>
    </Box>
  ),
};

/** Desktop variant — the same screen as a two-column browse / local layout. */
export const Desktop: Story = {
  render: () => (
    <Box
      p="lg"
      style={{
        display: 'flex',
        justifyContent: 'center',
        background: 'var(--mantine-color-default)',
      }}
    >
      <DeviceFrame width={DESKTOP}>
        <RepoBrowser cloned={['switchboard', 'widget-factory']} desktop />
      </DeviceFrame>
    </Box>
  ),
};
