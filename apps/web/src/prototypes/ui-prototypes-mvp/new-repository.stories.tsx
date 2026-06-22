import {
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  useComputedColorScheme,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  AppFrame,
  DeviceFrame,
  EmbossedLabel,
  flat,
  IndicatorLamp,
  OperationLedger,
  Panel,
  StatusLight,
  type Operation,
} from './kit';

/**
 * The **New repository** page — reached from the drawer's "New repository" button (was the standalone
 * repo-browser; confirms `repo-clone-browse`). Two ways to add a repo: clone one of your GitHub repos
 * from the list, or paste a git URL. Every clone lands in
 * `~/.switchboard/repos/<organisation>/<repo>` and runs through the operation ledger. Mobile-first +
 * desktop; renders browse / cloning (ledger + lock) / error. Static fake data only.
 *
 * Click actions:
 *   ‹ Worktrees      → back to the hub
 *   Clone (row)       → bare-clone into ~/.switchboard/repos/<owner>/<repo> (runs through the ledger)
 *   Clone from URL    → same, for an arbitrary git remote
 */

interface GhRepo {
  owner: string;
  name: string;
  description: string;
  lang: string;
  langColor: string;
  stars: number;
  updated: string;
}

const GITHUB_REPOS: GhRepo[] = [
  {
    owner: 'nick-boey',
    name: 'switchboard',
    description: 'Operator console for driving Claude sessions from your phone',
    lang: 'TypeScript',
    langColor: '#3178c6',
    stars: 128,
    updated: '2d ago',
  },
  {
    owner: 'acme',
    name: 'widget-factory',
    description: 'Reusable widget components and design tokens',
    lang: 'TypeScript',
    langColor: '#3178c6',
    stars: 54,
    updated: '5h ago',
  },
  {
    owner: 'octocat',
    name: 'Hello-World',
    description: 'My first repository on GitHub!',
    lang: 'JavaScript',
    langColor: '#f1e05a',
    stars: 1903,
    updated: '3w ago',
  },
  {
    owner: 'torvalds',
    name: 'linux',
    description: 'Linux kernel source tree',
    lang: 'C',
    langColor: '#555555',
    stars: 178000,
    updated: 'now',
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

/** One browsable GitHub repo with a clone action (or a "cloned" marker once it is local). */
function GithubRepoRow({
  repo,
  cloned,
  locked,
  divider,
}: {
  repo: GhRepo;
  cloned: boolean;
  locked: boolean;
  divider: boolean;
}) {
  return (
    <Box
      py={10}
      px={6}
      style={{ borderTop: divider ? '1px solid rgba(128,128,128,0.25)' : undefined }}
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
          <Group gap="sm" mt={5} wrap="nowrap" style={{ overflow: 'hidden' }}>
            <Group gap={5} wrap="nowrap" style={{ flex: 'none' }}>
              <LangDot color={repo.langColor} />
              <Text fz="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {repo.lang}
              </Text>
            </Group>
            <Text fz="xs" c="dimmed" style={{ whiteSpace: 'nowrap', flex: 'none' }}>
              ★ {repo.stars.toLocaleString()}
            </Text>
            <Text fz="xs" c="dimmed" truncate>
              {repo.updated}
            </Text>
          </Group>
        </Box>
        <Box style={{ flex: 'none' }}>
          {cloned ? (
            <Group gap={6} wrap="nowrap">
              <StatusLight tone="green" size={10} />
              <Text fz="xs" c="patina.7" fw={600}>
                cloned
              </Text>
            </Group>
          ) : (
            <Button size="xs" disabled={locked}>
              {locked ? 'Queued' : 'Clone'}
            </Button>
          )}
        </Box>
      </Group>
    </Box>
  );
}

/** The GitHub list: search over your repos, each with a clone action. */
function GithubRepoList({ cloned, locked }: { cloned: Set<string>; locked: boolean }) {
  return (
    <Panel>
      <EmbossedLabel>Clone from GitHub · nick-boey</EmbossedLabel>
      <TextInput mt="sm" size="sm" placeholder="Search your repositories…" defaultValue="" />
      <Panel pressed p="xs" mt="sm">
        <Stack gap={0}>
          {GITHUB_REPOS.map((repo, i) => (
            <GithubRepoRow
              key={`${repo.owner}/${repo.name}`}
              repo={repo}
              cloned={cloned.has(`${repo.owner}/${repo.name}`)}
              locked={locked}
              divider={i > 0}
            />
          ))}
        </Stack>
      </Panel>
    </Panel>
  );
}

/** Clone an arbitrary remote by URL — the "select a new repo to clone" path. */
function CloneFromUrl({ locked }: { locked: boolean }) {
  return (
    <Panel>
      <EmbossedLabel>Clone from URL</EmbossedLabel>
      <Stack gap="sm" mt="sm">
        <TextInput size="sm" placeholder="https://github.com/owner/repo.git" defaultValue="" />
        <Group gap={8} wrap="nowrap" align="center">
          <IndicatorLamp color="patina" size={9} />
          <Text fz="xs" c="dimmed">
            Clones into{' '}
            <Text span ff="monospace">
              ~/.switchboard/repos/&lt;org&gt;/&lt;repo&gt;
            </Text>
          </Text>
        </Group>
        <Button disabled={locked} variant="default">
          {locked ? 'Line busy…' : 'Clone repository'}
        </Button>
      </Stack>
    </Panel>
  );
}

interface ScreenProps {
  cloned?: string[];
  ledger?: Operation[];
  locked?: boolean;
  desktop?: boolean;
}

function NewRepository({ cloned = [], ledger, locked = false, desktop = false }: ScreenProps) {
  const clonedSet = new Set(cloned);
  const status = (
    <Group gap={8} wrap="nowrap">
      <StatusLight tone="green" size={11} />
      <Text fz="xs" fw={600}>
        nick-boey
      </Text>
    </Group>
  );

  const breadcrumb = (
    <Panel pressed p="xs">
      <Group gap={8} wrap="nowrap">
        <Text fz="xs" c="dimmed">
          ‹ Worktrees
        </Text>
        <Text fz="xs" c="dimmed">
          /
        </Text>
        <Text fz="sm" fw={700}>
          New repository
        </Text>
      </Group>
    </Panel>
  );

  return (
    <AppFrame status={status}>
      <Stack gap="md">
        {breadcrumb}
        {ledger && <OperationLedger ops={ledger} locked={locked} />}
        {desktop ? (
          <SimpleGrid cols={2} spacing="md">
            <GithubRepoList cloned={clonedSet} locked={locked} />
            <CloneFromUrl locked={locked} />
          </SimpleGrid>
        ) : (
          <>
            <GithubRepoList cloned={clonedSet} locked={locked} />
            <CloneFromUrl locked={locked} />
          </>
        )}
      </Stack>
    </AppFrame>
  );
}

const meta = {
  ...definePrototypeMeta({
    component: NewRepository,
    parameters: { layout: 'fullscreen' },
  }),
} satisfies Meta<typeof NewRepository>;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = 390;
const DESKTOP = 1120;

function Frame({ width, children }: { width: number; children: ReactNode }) {
  const dark = useComputedColorScheme('light') === 'dark';
  return (
    <Box
      p="lg"
      style={{ display: 'flex', justifyContent: 'center', background: flat(dark).ground }}
    >
      <DeviceFrame width={width}>{children}</DeviceFrame>
    </Box>
  );
}

/** Browse — clone from GitHub or by URL; one repo already cloned this session. */
export const Mobile: Story = {
  render: () => (
    <Frame width={PHONE}>
      <NewRepository cloned={['nick-boey/switchboard']} />
    </Frame>
  ),
};

/** Cloning — a clone running through the ledger into ~/.switchboard/repos; the line is locked. */
export const MobileCloning: Story = {
  render: () => (
    <Frame width={PHONE}>
      <NewRepository
        cloned={['nick-boey/switchboard']}
        locked
        ledger={[
          {
            id: 'op-clone-wf',
            label: 'Clone acme/widget-factory',
            status: 'running',
            detail: 'Receiving objects · 62% → ~/.switchboard/repos/acme/widget-factory',
            progress: 62,
          },
        ]}
      />
    </Frame>
  ),
};

/** Error — a clone failed (auth). The line is released; the failed op stays in the ledger to retry. */
export const MobileError: Story = {
  render: () => (
    <Frame width={PHONE}>
      <NewRepository
        cloned={['nick-boey/switchboard']}
        ledger={[
          {
            id: 'op-clone-linux',
            label: 'Clone torvalds/linux',
            status: 'failed',
            detail: 'authentication failed — check your GitHub token in ~/.switchboard',
          },
        ]}
      />
    </Frame>
  ),
};

/** Desktop — the same page as a two-column GitHub / URL layout. */
export const Desktop: Story = {
  render: () => (
    <Frame width={DESKTOP}>
      <NewRepository cloned={['nick-boey/switchboard', 'acme/widget-factory']} desktop />
    </Frame>
  ),
};
