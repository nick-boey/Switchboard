import { Box, Group, Stack, Text } from '@mantine/core';
import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toRepoId, type RepoTarget } from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import { Worktrees } from '../worktrees';
import { Button } from '../ui/controls';
import { StatusLight } from '../ui/lamp';
import { Card } from '../ui/surface';
import { SectionTitle } from '../ui/typography';
import { groupReposByOrg, repoAnchorId, type RepoOrgGroup } from './group-repos';

/** Header height (AppShell) + breathing room, so a deep-linked section clears the sticky header. */
const ANCHOR_OFFSET = 56 + 16;

/** Resolved state of the cloned-repositories list that drives the home (and the sidebar). */
export type ReposListStatus = 'loading' | 'error' | 'ready';

export interface ReposHomeViewProps {
  /** Resolved state of the cloned-repositories list. */
  status: ReposListStatus;
  /** Org-grouped repositories (meaningful when `status === 'ready'`). */
  groups: RepoOrgGroup[];
  /** Open the new-repository (clone) flow — wired to the empty-home CTA. */
  onNewRepository: () => void;
  /** Retry loading the cloned-repositories list — wired to the error state. */
  onRetry: () => void;
  /** Render a repository's worktree subtree (the container supplies the real `<Worktrees>`). */
  renderWorktrees: (target: RepoTarget) => ReactNode;
}

/**
 * The presentational repositories home (design "Presentational view + container split"): every
 * cloned repository on one page, grouped by organisation and ordered org-then-repo, each an anchored
 * section with its worktrees inline. Rendering is driven by an explicit list status so loading,
 * error (retryable, distinct from empty), and the empty clone CTA are all story-testable without
 * fetching; the `ReposHome` container maps the `['cloned-repos']` query onto these props.
 */
export function ReposHomeView({
  status,
  groups,
  onNewRepository,
  onRetry,
  renderWorktrees,
}: ReposHomeViewProps) {
  if (status === 'loading') {
    return (
      <Group gap={8} data-testid="repos-home-loading">
        <StatusLight tone="yellow" size={11} label="loading" />
        <Text fz="sm" c="dimmed">
          Loading repositories…
        </Text>
      </Group>
    );
  }

  if (status === 'error') {
    return (
      <Card data-testid="repos-home-error">
        <Stack gap="sm" align="center" py="lg">
          <Text fz="sm" c="dimmed" ta="center" maw={440}>
            Loading your repositories failed. Check your connection and try again.
          </Text>
          <Button intent="primary" onClick={onRetry} data-testid="repos-home-retry">
            Retry
          </Button>
        </Stack>
      </Card>
    );
  }

  if (groups.length === 0) {
    return (
      <Card data-testid="repos-home-empty">
        <Stack gap="sm" align="center" py="lg">
          <Text fz="sm" c="dimmed" ta="center" maw={440}>
            No repositories yet. Clone one from GitHub to start creating worktrees and launching
            Claude sessions.
          </Text>
          <Button intent="primary" onClick={onNewRepository} data-testid="repos-home-clone">
            Clone a repository
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="xl" data-testid="repos-home">
      {groups.map((group) => (
        <Stack gap="md" key={group.owner}>
          <SectionTitle>{group.owner}</SectionTitle>
          {group.repos.map((target) => (
            <Box
              key={toRepoId(target)}
              id={repoAnchorId(target)}
              style={{ scrollMarginTop: ANCHOR_OFFSET }}
            >
              {renderWorktrees(target)}
            </Box>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

export interface ReposHomeProps {
  /** Inject a typed client (Storybook / tests). The app builds one from runtime config. */
  client?: SwitchboardClient;
  /** Open the new-repository (clone) flow — owned by `AppShell`, shared with the sidebar action. */
  onNewRepository: () => void;
}

/**
 * The repositories-home container: reads the shared `['cloned-repos']` query, maps its
 * loading/error/refetch onto `ReposHomeView`'s status and retry props (so a failed query renders the
 * error state, never the empty CTA), groups the targets, and wires the real `<Worktrees>` container
 * into each repository section. Data wiring is covered by the E2E.
 */
export function ReposHome({ client: injected, onNewRepository }: ReposHomeProps) {
  const client = useMemo(() => injected ?? createSwitchboardClient(), [injected]);

  const cloned = useQuery({
    queryKey: ['cloned-repos'],
    queryFn: async (): Promise<{ repos: RepoTarget[] }> => {
      const res = await client.repos.cloned.$get();
      if (!res.ok) throw new Error(`cloned repos failed: ${res.status}`);
      return res.json();
    },
  });

  const status: ReposListStatus = cloned.isLoading ? 'loading' : cloned.isError ? 'error' : 'ready';

  return (
    <ReposHomeView
      status={status}
      groups={groupReposByOrg(cloned.data?.repos ?? [])}
      onNewRepository={onNewRepository}
      onRetry={() => void cloned.refetch()}
      renderWorktrees={(target) => <Worktrees repoId={toRepoId(target)} client={client} />}
    />
  );
}
