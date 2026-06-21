import { Badge, Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
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
  Toast,
  type LampColor,
  type Operation,
} from './kit';

/**
 * Screen 3 of the MVP flow — list running sessions and launch `claude --remote-control`, then hand
 * off to the official Claude mobile app via a toast (confirms the `claude-session-launch` change;
 * plan Decision 7). Mobile-first with a desktop variant; renders empty / launching (ledger + lock)
 * / handoff (success toast) / error states. Static fake data only.
 */

type SessionStatus = 'running' | 'idle' | 'exited';

interface Session {
  branch: string;
  model: string;
  endpoint: string;
  status: SessionStatus;
  started: string;
}

const LAMP: Record<SessionStatus, { color: LampColor; lit: boolean }> = {
  running: { color: 'patina', lit: true },
  idle: { color: 'brass', lit: true },
  exited: { color: 'signal', lit: false },
};

function SessionRow({ s, divider }: { s: Session; divider: boolean }) {
  const lamp = LAMP[s.status];
  return (
    <Box
      py={10}
      px={6}
      style={{ borderTop: divider ? '1px solid rgba(120,90,40,0.18)' : undefined }}
    >
      <Group justify="space-between" wrap="nowrap" align="center" gap="sm">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <IndicatorLamp color={lamp.color} lit={lamp.lit} size={11} label={s.status} />
          <Text fz="sm" fw={700} ff="monospace" truncate>
            {s.branch}
          </Text>
        </Group>
        <Badge size="xs" variant="light" color="brass" style={{ flex: 'none' }}>
          {s.model}
        </Badge>
      </Group>
      <Text fz="xs" c="dimmed" ff="monospace" truncate mt={2}>
        {s.endpoint}
      </Text>
      <Group justify="space-between" align="center" wrap="nowrap" mt={6}>
        <Text fz="xs" c="dimmed">
          {s.status} · started {s.started}
        </Text>
        <Group gap={6} wrap="nowrap" style={{ flex: 'none' }}>
          <Button size="xs" variant="default">
            Open
          </Button>
          <Button size="xs" variant="subtle" color="signal">
            Stop
          </Button>
        </Group>
      </Group>
    </Box>
  );
}

function LaunchPanel({ branch, locked = false }: { branch: string; locked?: boolean }) {
  return (
    <Panel>
      <EmbossedLabel>Launch session</EmbossedLabel>
      <Stack gap="sm" mt="sm">
        <Group gap={6} wrap="nowrap">
          <Text fz="xs" c="dimmed">
            worktree
          </Text>
          <Text fz="sm" fw={700} ff="monospace">
            {branch}
          </Text>
        </Group>
        <Panel pressed p="xs">
          <Text fz="xs" ff="monospace" c="patina.8">
            $ claude --remote-control
          </Text>
        </Panel>
        <Button disabled={locked}>{locked ? 'Launching…' : 'Launch session'}</Button>
      </Stack>
    </Panel>
  );
}

interface ScreenProps {
  sessions: Session[];
  ledger?: Operation[];
  locked?: boolean;
  toast?: ReactNode;
  desktop?: boolean;
}

const WORKTREE = 'feature/remote-control';

function Sessions({ sessions, ledger, locked = false, toast, desktop = false }: ScreenProps) {
  const running = sessions.filter((s) => s.status === 'running').length;
  const status = (
    <Group gap={8} wrap="nowrap">
      <IndicatorLamp color="patina" lit={running > 0} size={11} label="sessions" />
      <Text fz="xs" fw={600}>
        {running} live
      </Text>
    </Group>
  );

  const context = (
    <Panel pressed p="xs">
      <Group gap={8} wrap="nowrap">
        <Text fz="xs" c="dimmed">
          ‹ switchboard
        </Text>
        <Text fz="xs" c="dimmed">
          /
        </Text>
        <Text fz="sm" fw={700} ff="monospace" truncate>
          {WORKTREE}
        </Text>
      </Group>
    </Panel>
  );

  const list = (
    <Panel>
      <Group justify="space-between" align="center">
        <EmbossedLabel>Sessions</EmbossedLabel>
        <Text fz="xs" c="dimmed">
          {sessions.length} total
        </Text>
      </Group>
      {sessions.length === 0 ? (
        <Panel pressed mt="sm">
          <Stack gap={4} align="center" py="lg">
            <IndicatorLamp color="patina" size={16} label="no sessions" />
            <Text fz="sm" fw={600}>
              No sessions running
            </Text>
            <Text fz="xs" c="dimmed" ta="center" maw={260}>
              Launch{' '}
              <Text span ff="monospace">
                claude --remote-control
              </Text>{' '}
              to start one, then drive it from the Claude mobile app.
            </Text>
          </Stack>
        </Panel>
      ) : (
        <Panel pressed p="xs" mt="sm">
          <Stack gap={0}>
            {sessions.map((s, i) => (
              <SessionRow key={s.branch} s={s} divider={i > 0} />
            ))}
          </Stack>
        </Panel>
      )}
    </Panel>
  );

  return (
    <AppFrame status={status} toast={toast}>
      <Stack gap="md">
        {context}
        {ledger && <OperationLedger ops={ledger} locked={locked} />}
        {desktop ? (
          <SimpleGrid cols={2} spacing="md">
            {list}
            <LaunchPanel branch={WORKTREE} locked={locked} />
          </SimpleGrid>
        ) : (
          <>
            {list}
            <LaunchPanel branch={WORKTREE} locked={locked} />
          </>
        )}
      </Stack>
    </AppFrame>
  );
}

const LIVE: Session = {
  branch: 'feature/remote-control',
  model: 'opus 4.8',
  endpoint: 'remote-control · ready',
  status: 'running',
  started: '2m ago',
};
const IDLE: Session = {
  branch: 'fix/clone-retry',
  model: 'sonnet 4.6',
  endpoint: 'remote-control · idle',
  status: 'idle',
  started: '1h ago',
};

const meta = {
  ...definePrototypeMeta({
    component: Sessions,
    parameters: { layout: 'fullscreen' },
  }),
} satisfies Meta<typeof Sessions>;

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

/** Empty — no sessions yet; the launch panel is the call to action. */
export const Mobile: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Sessions sessions={[]} />
    </Frame>
  ),
};

/** In-progress — launching the remote-control session; the line is locked. */
export const MobileLaunching: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Sessions
        sessions={[]}
        locked
        ledger={[
          {
            id: 'op-launch',
            label: 'Launch claude --remote-control',
            status: 'running',
            detail: 'starting session on feature/remote-control',
            progress: undefined,
          },
        ]}
      />
    </Frame>
  ),
};

/** Handoff — the session is live and the toast tells the operator to open the Claude mobile app. */
export const MobileHandoff: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Sessions
        sessions={[LIVE]}
        toast={
          <Toast tone="patina" title="Session live on feature/remote-control">
            Open the Claude app on your phone to drive the conversation.
          </Toast>
        }
      />
    </Frame>
  ),
};

/** Error — launch failed because the remote-control port is taken. */
export const MobileError: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Sessions
        sessions={[IDLE]}
        ledger={[
          {
            id: 'op-launch',
            label: 'Launch claude --remote-control',
            status: 'failed',
            detail: 'remote-control port 7777 already in use — stop the other session first',
          },
        ]}
      />
    </Frame>
  ),
};

/** Desktop variant — sessions list and launch panel side by side, with the handoff toast. */
export const Desktop: Story = {
  render: () => (
    <Frame width={DESKTOP}>
      <Sessions
        sessions={[LIVE, IDLE]}
        desktop
        toast={
          <Toast tone="patina" title="Session live on feature/remote-control">
            Open the Claude app on your phone to drive the conversation.
          </Toast>
        }
      />
    </Frame>
  ),
};
