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
import { useEffect, useMemo, useState } from 'react';
import type { RepoTarget } from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import type { SwitchboardTokens } from '../theme/theme';
import { ReposFlow } from '../repos/ReposFlow';
import { ReposHome } from '../repos/ReposHome';
import { ReposNav } from '../repos/ReposNav';
import { groupReposByOrg, repoAnchorId } from '../repos/group-repos';
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
  /** Live Claude session count shown in the header (display-only). */
  liveSessions?: number;
}

/**
 * The flat application shell (repos-home-and-sidebar). A flat header — brand plug + tracked
 * wordmark, a live-session count, and a burger that opens the nav drawer below the breakpoint —
 * over the per-organisation repositories navigation (`ReposNav`) and a main region that shows the
 * aggregated repositories home (`ReposHome`) or the new-repository clone flow. Navigation is
 * `useState`-based: a sidebar repo link sets the home view and a pending scroll target, and a
 * mount-then-scroll effect brings that repository's section into view once it has mounted.
 */
export function AppShell({ client: injectedClient, liveSessions = 0 }: AppShellProps) {
  const [navOpened, { toggle: toggleNav }] = useDisclosure(false);
  const [view, setView] = useState<'home' | 'new-repo'>('home');
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState<string | null>(null);
  const theme = useMantineTheme();
  const tokens = theme.other as SwitchboardTokens;

  const client = useMemo(() => injectedClient ?? createSwitchboardClient(), [injectedClient]);

  // Shared `['cloned-repos']` query key across the sidebar and the home, so the list is fetched
  // once and the two surfaces stay consistent. The sidebar renders repository buttons only from a
  // successfully resolved list, so a loading or failed list shows the "New repository"-only rail.
  const cloned = useQuery({
    queryKey: ['cloned-repos'],
    queryFn: async (): Promise<{ repos: RepoTarget[] }> => {
      const res = await client.repos.cloned.$get();
      if (!res.ok) throw new Error(`cloned repos failed: ${res.status}`);
      return res.json();
    },
  });
  const navGroups = cloned.isSuccess ? groupReposByOrg(cloned.data.repos) : [];

  const openNewRepository = (): void => setView('new-repo');
  const selectRepo = (target: RepoTarget): void => {
    setView('home');
    setPendingScrollAnchor(repoAnchorId(target));
  };

  // Mount-then-scroll for cross-view activation: scroll only once the target section has mounted
  // (guarding on the element being present), then clear the pending id. Re-runs when the list data
  // arrives so a section that mounts after the click is still reached.
  useEffect(() => {
    if (!pendingScrollAnchor) return;
    const el = document.getElementById(pendingScrollAnchor);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setPendingScrollAnchor(null);
  }, [pendingScrollAnchor, cloned.data]);

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
              size="sm"
              aria-label="Toggle navigation"
              data-testid="nav-burger"
            />
            <Plug status="running" size={18} label="Operator line" data-testid="brand-mark" />
            <Title
              order={1}
              fz="h4"
              style={{ letterSpacing: tokens.wordmarkTracking, textTransform: 'uppercase' }}
            >
              Switchboard
            </Title>
          </Group>
          <Group gap={6} wrap="nowrap" data-testid="live-session-count">
            <Plug
              status={liveSessions > 0 ? 'running' : 'off'}
              size={12}
              label={`${liveSessions} live sessions`}
            />
            <Text fz="xs" fw={600}>
              {liveSessions} live
            </Text>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="md" data-testid="nav-rail">
        <ReposNav
          groups={navGroups}
          onSelectRepo={selectRepo}
          onNewRepository={openNewRepository}
        />
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        {view === 'new-repo' ? (
          <ReposFlow client={client} />
        ) : (
          <ReposHome client={client} onNewRepository={openNewRepository} />
        )}
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
