import {
  AppShell as MantineAppShell,
  Burger,
  Group,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import type { SwitchboardTokens } from '../theme/theme';
import { Card } from '../ui/surface';
import { JackButton } from './JackButton';

export interface AppShellProps {
  /** Inject a typed client (Storybook / tests). The app builds one from runtime config. */
  client?: SwitchboardClient;
}

/**
 * The mobile-first application shell (design Decision 7) — a header wordmark with the jack
 * motif over a collapsible navbar, and a main region whose "line status" panel round-trips the
 * placeholder route via the typed `hc` client + TanStack Query. A successful round trip proves
 * the bearer path (Decision 3); real screens land in later changes.
 */
export function AppShell({ client: injectedClient }: AppShellProps) {
  const [navOpened, { toggle: toggleNav }] = useDisclosure(false);
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
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding="md"
      data-testid="app-shell"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <Burger
            opened={navOpened}
            onClick={toggleNav}
            hiddenFrom="sm"
            size="sm"
            aria-label="Toggle navigation"
          />
          <JackButton label="Operator line" active data-testid="brand-jack" />
          <Title
            order={1}
            fz="h3"
            style={{ letterSpacing: tokens.wordmarkTracking, textTransform: 'uppercase' }}
          >
            Switchboard
          </Title>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p="md">
        <Text fw={700} tt="uppercase" fz="sm" c="patina.8">
          Lines
        </Text>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
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
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
