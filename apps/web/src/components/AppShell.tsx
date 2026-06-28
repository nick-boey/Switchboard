import {
  AppShell as MantineAppShell,
  Burger,
  Group,
  Text,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { RepoTarget } from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import type { SwitchboardTokens } from '../theme/theme';
import { ReposNav } from '../repos/ReposNav';
import { groupReposByOrg } from '../repos/group-repos';
import { useLiveSessionCount } from '../sessions';
import { Plug } from '../ui/plug';

/**
 * House responsive breakpoint: below it the navigation is an off-canvas drawer reached via the
 * header burger; at/above it the navigation is a persistent rail. One composition adapts — no
 * separate mobile-only component set.
 */
export const LAYOUT_BREAKPOINT = 'sm';

export interface AppShellProps {
  /** Inject a typed client (Storybook / tests). The app builds one from runtime config. */
  client?: SwitchboardClient;
  /**
   * Override the header live-session count (Storybook / tests). When omitted, the count is derived
   * from real per-repo liveness across the cloned repositories.
   */
  liveSessions?: number;
}

/**
 * The application shell — the **root route's layout** (design D2). A flat header — brand plug +
 * tracked wordmark, a live-session count, and a burger that opens the nav drawer below the
 * breakpoint — over the per-organisation repositories navigation (`ReposNav`, whose links are typed
 * router `Link`s) and a main region that renders the matched route via `<Outlet />`. Navigation is
 * URL-driven: the sidebar and the deep-link / reload paths all set the page through the router, so
 * the shell holds no `view` state — it only fetches the shared `['cloned-repos']` list for the rail.
 */
export function AppShell({ client: injectedClient, liveSessions }: AppShellProps) {
  const [navOpened, { toggle: toggleNav }] = useDisclosure(false);
  const theme = useMantineTheme();
  const tokens = theme.other as SwitchboardTokens;

  const client = useMemo(() => injectedClient ?? createSwitchboardClient(), [injectedClient]);

  // Shared `['cloned-repos']` query key across the sidebar and the home, so the list is fetched
  // once and the two surfaces stay consistent. The sidebar renders repository links only from a
  // successfully resolved list, so a loading or failed list shows the "New repository"-only rail.
  const cloned = useQuery({
    queryKey: ['cloned-repos'],
    queryFn: async (): Promise<{ repos: RepoTarget[] }> => {
      const res = await client.repos.cloned.$get();
      if (!res.ok) throw new Error(`cloned repos failed: ${res.status}`);
      return res.json();
    },
  });
  const repos = cloned.isSuccess ? cloned.data.repos : [];
  const navGroups = groupReposByOrg(repos);

  // Header live-session count: the aggregate of every cloned repo's live sessions (there is no
  // global sessions endpoint). The `liveSessions` prop, when provided, overrides for Storybook/tests
  // and is kept genuinely display-only — passing `[]` suppresses the per-repo liveness queries so an
  // injected count never triggers session polling.
  const derivedLiveSessions = useLiveSessionCount(client, liveSessions === undefined ? repos : []);
  const liveSessionCount = liveSessions ?? derivedLiveSessions;

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: LAYOUT_BREAKPOINT, collapsed: { mobile: !navOpened } }}
      padding="md"
      data-testid="app-shell"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" gap="sm" wrap="nowrap" justify="space-between">
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={navOpened}
              onClick={toggleNav}
              hiddenFrom={LAYOUT_BREAKPOINT}
              size="xs"
              aria-label="Toggle navigation"
              data-testid="nav-burger"
            />
            <Plug status="running" size={12} label="Operator line" data-testid="brand-mark" />
            <Title
              order={1}
              fz="xs"
              fw="normal"
              style={{ letterSpacing: tokens.wordmarkTracking, textTransform: 'uppercase' }}
            >
              Switchboard
            </Title>
          </Group>
          <Group gap={6} wrap="nowrap" data-testid="live-session-count">
            <Plug
              status={liveSessionCount > 0 ? 'running' : 'off'}
              size={12}
              label={`${liveSessionCount} live sessions`}
            />
            <Text fz="xs">{liveSessionCount}</Text>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="md" data-testid="nav-rail">
        <ReposNav groups={navGroups} />
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
