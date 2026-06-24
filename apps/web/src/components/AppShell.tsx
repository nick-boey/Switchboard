import {
  AppShell as MantineAppShell,
  Burger,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import type { SwitchboardTokens } from '../theme/theme';
import { ReposFlow } from '../repos/ReposFlow';
import { WorktreesHub } from '../worktrees/WorktreesHub';
import { Plug } from '../ui/plug';
import { Card } from '../ui/surface';
import { SectionTitle } from '../ui/typography';

/**
 * House responsive breakpoint (task 8.6): below it the navigation is an off-canvas drawer reached
 * via the header burger; at/above it the navigation is a persistent rail. One composition adapts —
 * no separate mobile-only component set.
 */
export const LAYOUT_BREAKPOINT = 'sm';

export interface AppShellProps {
  /** Inject a typed client (Storybook / tests). The app builds one from runtime config. */
  client?: SwitchboardClient;
  /** Live Claude session count shown in the header (display-only). */
  liveSessions?: number;
}

/**
 * The flat mobile-first application shell (ui-prototypes-mvp). A flat header — brand plug +
 * tracked wordmark, a live-session count, and a burger that opens the nav drawer below the
 * breakpoint — over a navigation rail and a main region whose line-status `Card` round-trips the
 * placeholder route. Built from the matured `src/ui` primitives; it **consumes** the resolved
 * colour scheme (via the `--sb-*` variables) and never sets it.
 */
export function AppShell({ client: injectedClient, liveSessions = 0 }: AppShellProps) {
  const [navOpened, { toggle: toggleNav }] = useDisclosure(false);
  const [view, setView] = useState<'home' | 'new-repo' | 'worktrees'>('home');
  const theme = useMantineTheme();
  const tokens = theme.other as SwitchboardTokens;

  const client = useMemo(() => injectedClient ?? createSwitchboardClient(), [injectedClient]);

  const lineStatus = useQuery({
    queryKey: ['line-status'],
    queryFn: async () => {
      const res = await client.echo.$post({ json: { message: 'switchboard-online' } });
      if (!res.ok) throw new Error(`line check failed: ${res.status}`);
      return res.json();
    },
  });

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
        <Stack gap="xs">
          <SectionTitle>Lines</SectionTitle>
          <UnstyledButton
            data-testid="nav-worktrees"
            onClick={() => setView('worktrees')}
            style={{ fontSize: 'var(--mantine-font-size-sm)', fontWeight: 600 }}
          >
            Worktrees
          </UnstyledButton>
          <UnstyledButton
            data-testid="nav-new-repository"
            onClick={() => setView('new-repo')}
            style={{ fontSize: 'var(--mantine-font-size-sm)', fontWeight: 600 }}
          >
            New repository
          </UnstyledButton>
        </Stack>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        {view === 'worktrees' ? (
          <WorktreesHub client={client} />
        ) : view === 'new-repo' ? (
          <ReposFlow client={client} />
        ) : (
          <Stack gap="md">
            <Card title="Line status" data-testid="line-status">
              <Text data-testid="line-status-value">
                {lineStatus.isSuccess
                  ? lineStatus.data.message
                  : lineStatus.isError
                    ? 'line check failed'
                    : 'connecting…'}
              </Text>
            </Card>
          </Stack>
        )}
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
