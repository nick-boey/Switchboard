import { Box, Button, Group, Stack, Text, useComputedColorScheme } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  DeviceFrame,
  EmbossedLabel,
  flat,
  IndicatorSymbol,
  Panel,
  Plug,
  SectionTitle,
  StatusLight,
} from './kit';
import {
  CreateWorktreeModal,
  groupByOrg,
  HubShell,
  IndicatorActionModal,
  PlusGlyph,
  RepoBlock,
  RepoDrawer,
  StopSessionModal,
  WorktreeSearchBar,
  type HubRepo,
} from './hub';

/**
 * Screen 2 (now the **centre of the app**) — the worktrees hub. A cloned-repos drawer (persistent
 * rail on desktop, slide-in overlay on mobile) sits beside the main pane: a search + Active/Inactive
 * filter bar over org→repo headings, each repo a card whose worktrees are sections. Every section
 * carries a **plug** (Claude Code on/off), a **git-status lamp**, a **PR-status lamp**, and a delete
 * button; an empty "Add worktree…" row caps each card. Built entirely from the composed components in
 * `hub.tsx`. Static fake data only.
 *
 * Indicator legend (see the `Legend` story for the on-screen version):
 *   Plug   green inner = Claude Code live · neutral inner = idle worktree
 *   Git    neutral = up to date · yellow = behind · green = ahead · red = diverged
 *   PR     neutral = none · blue = open · green = ready · red = checks failing · yellow = conflicts · purple = merged
 *   Delete lit (bright red) only when a worktree is idle AND its PR is merged — i.e. safe to remove
 *
 * Click actions are documented in `hub.tsx`'s header and surfaced in the `Legend` story.
 */

// --- Fake data --------------------------------------------------------------

const REPOS: HubRepo[] = [
  {
    id: 'nick-boey/switchboard',
    org: 'nick-boey',
    name: 'switchboard',
    worktrees: [
      {
        branch: 'main',
        path: 'main (primary checkout)',
        dirty: 'clean',
        active: false,
        remote: 'up-to-date',
        pr: 'none',
      },
      {
        branch: 'feature/remote-control',
        path: '.worktrees/feature-remote-control',
        dirty: '3 changes',
        active: true,
        remote: 'ahead',
        pr: 'open',
      },
      {
        branch: 'fix/clone-retry',
        path: '.worktrees/fix-clone-retry',
        dirty: 'clean',
        active: false,
        remote: 'behind',
        pr: 'checks-failing',
      },
    ],
  },
  {
    id: 'acme/widget-factory',
    org: 'acme',
    name: 'widget-factory',
    worktrees: [
      {
        branch: 'main',
        path: 'main (primary checkout)',
        dirty: 'clean',
        active: false,
        remote: 'up-to-date',
        pr: 'none',
      },
      {
        branch: 'spike/ui-tokens',
        path: '.worktrees/spike-ui-tokens',
        dirty: '2 changes',
        active: true,
        remote: 'diverged',
        pr: 'conflicts-failing',
      },
      {
        branch: 'chore/bump-deps',
        path: '.worktrees/chore-bump-deps',
        dirty: 'clean',
        active: false,
        remote: 'behind',
        pr: 'merged',
      },
    ],
  },
  {
    id: 'octocat/Hello-World',
    org: 'octocat',
    name: 'Hello-World',
    worktrees: [
      {
        branch: 'main',
        path: 'main (primary checkout)',
        dirty: 'clean',
        active: false,
        remote: 'up-to-date',
        pr: 'none',
      },
    ],
  },
];

/** Filter the dataset the way the search + filter chips would (so a static story can show the result). */
function filterRepos(
  repos: HubRepo[],
  query: string,
  activeOn: boolean,
  inactiveOn: boolean,
): HubRepo[] {
  const q = query.trim().toLowerCase();
  return repos
    .map((repo) => {
      const repoMatch = `${repo.org}/${repo.name}`.toLowerCase().includes(q);
      const worktrees = repo.worktrees.filter((wt) => {
        const activeOk = wt.active ? activeOn : inactiveOn;
        const queryOk = !q || repoMatch || wt.branch.toLowerCase().includes(q);
        return activeOk && queryOk;
      });
      return { ...repo, worktrees };
    })
    .filter((repo) => repo.worktrees.length > 0);
}

// --- Hub composition --------------------------------------------------------

interface HubProps {
  repos?: HubRepo[];
  desktop?: boolean;
  drawerOpen?: boolean;
  overlay?: ReactNode;
  selectedRepoId?: string;
  query?: string;
  activeOn?: boolean;
  inactiveOn?: boolean;
}

function EmptyHub({ onClone }: { onClone?: () => void }) {
  return (
    <Panel>
      <Stack gap="md" align="center" py="xl">
        <Plug status="off" size={24} label="no repositories" />
        <Text fz="sm" fw={700}>
          No repositories cloned yet
        </Text>
        {/* Primary CTA → the New repository / clone page (same destination as the drawer button). */}
        <Button size="sm" leftSection={<PlusGlyph />} onClick={onClone}>
          New repository
        </Button>
      </Stack>
    </Panel>
  );
}

function Hub({
  repos = REPOS,
  desktop = false,
  drawerOpen = false,
  overlay,
  selectedRepoId,
  query = '',
  activeOn = true,
  inactiveOn = true,
}: HubProps) {
  const visible = filterRepos(repos, query, activeOn, inactiveOn);
  // Sorted by org then repo name; each repo renders as its own heading + card (no org-group card).
  const repoList = groupByOrg(visible).flatMap((g) => g.repos);
  const liveCount = repos.flatMap((r) => r.worktrees).filter((w) => w.active).length;

  const status = (
    <Group gap={8} wrap="nowrap">
      <StatusLight tone={liveCount > 0 ? 'green' : 'neutral'} size={11} />
      <Text fz="xs" fw={600}>
        {liveCount} live
      </Text>
    </Group>
  );

  const drawer = (
    <RepoDrawer
      repos={repos}
      selectedRepoId={selectedRepoId}
      onClose={desktop ? undefined : () => {}}
    />
  );

  const main = (
    <Stack gap="lg">
      <WorktreeSearchBar query={query} activeOn={activeOn} inactiveOn={inactiveOn} />
      {repoList.length === 0 ? (
        <EmptyHub />
      ) : (
        repoList.map((repo) => (
          <RepoBlock key={repo.id} repo={repo} highlight={repo.id === selectedRepoId} />
        ))
      )}
    </Stack>
  );

  return (
    <HubShell
      desktop={desktop}
      drawer={drawer}
      drawerOpen={drawerOpen}
      status={status}
      overlay={overlay}
    >
      {main}
    </HubShell>
  );
}

// --- Meta + framing ---------------------------------------------------------

const meta = {
  ...definePrototypeMeta({
    component: Hub,
    parameters: { layout: 'fullscreen' },
  }),
} satisfies Meta<typeof Hub>;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = 390;
const DESKTOP = 1180;

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

// --- Stories ----------------------------------------------------------------

/** Mobile, drawer closed — the hub as the landing screen: search/filter bar over org→repo cards. */
export const Mobile: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Hub />
    </Frame>
  ),
};

/** Mobile, drawer open — the repositories overlay (cloned repos by org · New repository · Settings). */
export const MobileDrawer: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Hub drawerOpen selectedRepoId="nick-boey/switchboard" />
    </Frame>
  ),
};

/** Mobile, filtered — the Active-only chip (Inactive off) narrows each card to its live worktrees. */
export const MobileFiltered: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Hub query="" activeOn inactiveOn={false} />
    </Frame>
  ),
};

/** Add worktree — the empty card row opened the create modal (base branch defaults to main). */
export const MobileCreateWorktree: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Hub overlay={<CreateWorktreeModal repo="nick-boey/switchboard" />} />
    </Frame>
  ),
};

/** Stop session — clicking a LIVE (green) plug raises the warning before stopping Claude Code. */
export const MobileStopSession: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Hub overlay={<StopSessionModal branch="feature/remote-control" />} />
    </Frame>
  ),
};

/** Indicator action — clicking a git/PR lamp opens its (deferred) action modal. */
export const MobileIndicatorAction: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Hub overlay={<IndicatorActionModal kind="pr" detail="PR #42 · checks failing" />} />
    </Frame>
  ),
};

/** Empty — nothing cloned yet; the hub points at New repository. */
export const MobileEmpty: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Hub repos={[]} />
    </Frame>
  ),
};

/** Desktop — persistent repo rail beside the same org→repo cards. */
export const Desktop: Story = {
  render: () => (
    <Frame width={DESKTOP}>
      <Hub desktop selectedRepoId="nick-boey/switchboard" />
    </Frame>
  ),
};

// --- On-screen interaction legend (documents every click) -------------------

function LegendRow({ swatch, term, action }: { swatch: ReactNode; term: string; action: string }) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Box style={{ width: 28, display: 'flex', justifyContent: 'center', flex: 'none' }}>
        {swatch}
      </Box>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text fz="sm" fw={700}>
          {term}
        </Text>
        <Text fz="xs" c="dimmed">
          {action}
        </Text>
      </Box>
    </Group>
  );
}

function Legend() {
  return (
    <Stack gap="lg">
      <Panel>
        <EmbossedLabel>Plug — Claude Code</EmbossedLabel>
        <Stack gap="sm" mt="sm">
          <LegendRow
            swatch={<Plug status="running" size={20} />}
            term="Active (green inner)"
            action="Claude Code is live · click → stop (warning modal)"
          />
          <LegendRow
            swatch={<Plug status="idle" size={20} />}
            term="Inactive (neutral inner)"
            action="Worktree exists, Claude off · click → start claude --remote-control"
          />
        </Stack>
      </Panel>

      <Panel>
        <Group gap={8} align="center">
          <Box c="dimmed" style={{ lineHeight: 0 }}>
            <IndicatorSymbol kind="git" />
          </Box>
          <EmbossedLabel>Git status lamp</EmbossedLabel>
        </Group>
        <Stack gap="sm" mt="sm">
          <LegendRow
            swatch={<StatusLight tone="neutral" />}
            term="Up to date (neutral)"
            action="Local matches the remote"
          />
          <LegendRow
            swatch={<StatusLight tone="yellow" />}
            term="Behind (yellow)"
            action="Remote has commits the worktree doesn’t"
          />
          <LegendRow
            swatch={<StatusLight tone="green" />}
            term="Ahead (green)"
            action="Worktree has commits to push"
          />
          <LegendRow
            swatch={<StatusLight tone="red" />}
            term="Diverged (red)"
            action="Local and remote have both moved on"
          />
          <Text fz="xs" c="dimmed">
            Click → status / action modal (deferred).
          </Text>
        </Stack>
      </Panel>

      <Panel>
        <Group gap={8} align="center">
          <Box c="dimmed" style={{ lineHeight: 0 }}>
            <IndicatorSymbol kind="pr" />
          </Box>
          <EmbossedLabel>PR status lamp</EmbossedLabel>
        </Group>
        <Stack gap="sm" mt="sm">
          <LegendRow
            swatch={<StatusLight tone="neutral" />}
            term="No PR (neutral)"
            action="No pull request open for the branch"
          />
          <LegendRow
            swatch={<StatusLight tone="blue" />}
            term="PR open (blue)"
            action="A pull request exists"
          />
          <LegendRow
            swatch={<StatusLight tone="green" />}
            term="Ready to merge (green)"
            action="Open, checks passing, mergeable"
          />
          <LegendRow
            swatch={<StatusLight tone="red" />}
            term="Checks failing (red)"
            action="Open but CI is red (overrides conflicts)"
          />
          <LegendRow
            swatch={<StatusLight tone="yellow" />}
            term="Merge conflicts (yellow)"
            action="Open with conflicts (red if checks also fail)"
          />
          <LegendRow
            swatch={<StatusLight tone="purple" />}
            term="Merged (purple)"
            action="PR merged — the branch's work is integrated"
          />
          <Text fz="xs" c="dimmed">
            Click → status / action modal (deferred).
          </Text>
        </Stack>
      </Panel>

      <Panel>
        <EmbossedLabel>Other actions</EmbossedLabel>
        <Stack gap="xs" mt="sm">
          <Text fz="sm">
            <Text span fw={700}>
              Add worktree…
            </Text>{' '}
            — empty row at the bottom of a card → create modal (pick base branch, default main;
            Claude stays off).
          </Text>
          <Text fz="sm">
            <Text span fw={700}>
              Delete
            </Text>{' '}
            — red square on the right of the indicator row. Visual sketch only: it lights up bright
            red once the worktree is idle and its PR is merged (safe to remove); otherwise it sits
            back as a darker red. Deletion behaviour is deferred to worktree-management.
          </Text>
          <Text fz="sm">
            <Text span fw={700}>
              New repository / Settings
            </Text>{' '}
            — drawer buttons open the clone page and the settings page.
          </Text>
        </Stack>
      </Panel>
    </Stack>
  );
}

function LegendBody() {
  const dark = useComputedColorScheme('light') === 'dark';
  return (
    <Box p="md" style={{ background: flat(dark).body }}>
      <SectionTitle mb="md">Worktree controls — what each click does</SectionTitle>
      <Legend />
    </Box>
  );
}

/** Reference — the indicator + click-action legend, rendered on screen (not just in code comments). */
export const LegendReference: Story = {
  render: () => (
    <Frame width={420}>
      <LegendBody />
    </Frame>
  ),
};
