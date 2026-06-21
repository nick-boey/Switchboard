import { Badge, Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  AppFrame,
  DeviceFrame,
  EmbossedLabel,
  IndicatorLamp,
  OperationLedger,
  PANEL_RADIUS,
  Panel,
  Plug,
  SectionTitle,
  Toast,
  type Corner,
  type Operation,
  type PlugStatus,
} from './kit';

/**
 * Screen 3 of the MVP flow — list running sessions and launch `claude --remote-control`, then hand
 * off to the official Claude mobile app via a toast (confirms `claude-session-launch`; plan
 * Decision 7). Flat language. Sessions are grouped by repo: one panel per session, stacked with NO
 * gap inside a group, gaps only between repo groups. Mobile-first + desktop; renders empty /
 * launching (ledger + lock) / handoff (toast) / error states. Static fake data only.
 */

type SessionStatus = 'running' | 'idle' | 'exited';

interface Session {
  repo: string;
  branch: string;
  model: string;
  endpoint: string;
  status: SessionStatus;
  started: string;
}

const PLUG_FOR: Record<SessionStatus, PlugStatus> = {
  running: 'running',
  idle: 'idle',
  exited: 'off',
};

type Position = 'single' | 'first' | 'middle' | 'last';

/** Corners that carry screws for a panel at this position in a stack — only the group's outer ones. */
const CORNERS: Record<Position, Corner[]> = {
  single: ['tl', 'tr', 'bl', 'br'],
  first: ['tl', 'tr'],
  middle: [],
  last: ['bl', 'br'],
};

/** Radius + negative-margin overrides so stacked session panels collapse into one gapless group. */
function stackStyle(position: Position): CSSProperties {
  const top = position === 'first' || position === 'single';
  const bottom = position === 'last' || position === 'single';
  return {
    marginTop: top ? 0 : -1,
    borderTopLeftRadius: top ? PANEL_RADIUS : 0,
    borderTopRightRadius: top ? PANEL_RADIUS : 0,
    borderBottomLeftRadius: bottom ? PANEL_RADIUS : 0,
    borderBottomRightRadius: bottom ? PANEL_RADIUS : 0,
  };
}

function SessionPanel({ s, position }: { s: Session; position: Position }) {
  return (
    <Panel p="md" corners={CORNERS[position]} style={stackStyle(position)}>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Plug status={PLUG_FOR[s.status]} size={18} label={s.status} />
          <Text fz="sm" fw={700} ff="monospace" truncate>
            {s.branch}
          </Text>
        </Group>
        <Badge size="xs" variant="light" color="brass" style={{ flex: 'none' }}>
          {s.model}
        </Badge>
      </Group>
      <Group justify="space-between" align="center" wrap="nowrap" mt={6}>
        <Text fz="xs" c="dimmed" ff="monospace" truncate>
          {s.endpoint} · {s.started}
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
    </Panel>
  );
}

/** A repo's sessions: a plain-text group header over a gapless stack of single-session panels. */
function SessionGroup({ repo, sessions }: { repo: string; sessions: Session[] }) {
  return (
    <Stack gap={6}>
      <SectionTitle>{repo}</SectionTitle>
      <Box>
        {sessions.map((s, i) => {
          const position: Position =
            sessions.length === 1
              ? 'single'
              : i === 0
                ? 'first'
                : i === sessions.length - 1
                  ? 'last'
                  : 'middle';
          return <SessionPanel key={s.branch} s={s} position={position} />;
        })}
      </Box>
    </Stack>
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

const LAUNCH_TARGET = 'feature/remote-control';

function groupByRepo(sessions: Session[]): { repo: string; sessions: Session[] }[] {
  const order: string[] = [];
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!map.has(s.repo)) {
      map.set(s.repo, []);
      order.push(s.repo);
    }
    map.get(s.repo)!.push(s);
  }
  return order.map((repo) => ({ repo, sessions: map.get(repo)! }));
}

function Sessions({ sessions, ledger, locked = false, toast, desktop = false }: ScreenProps) {
  const running = sessions.filter((s) => s.status === 'running').length;
  const groups = groupByRepo(sessions);
  const status = (
    <Group gap={8} wrap="nowrap">
      <IndicatorLamp color="patina" lit={running > 0} size={11} label="sessions" />
      <Text fz="xs" fw={600}>
        {running} live
      </Text>
    </Group>
  );

  const list =
    sessions.length === 0 ? (
      <Panel pressed>
        <Stack gap={4} align="center" py="lg">
          <Plug status="off" size={22} label="no sessions" />
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
      <Stack gap="lg">
        {groups.map((g) => (
          <SessionGroup key={g.repo} repo={g.repo} sessions={g.sessions} />
        ))}
      </Stack>
    );

  return (
    <AppFrame status={status} toast={toast}>
      <Stack gap="md">
        {ledger && <OperationLedger ops={ledger} locked={locked} />}
        {desktop ? (
          <SimpleGrid cols={2} spacing="md">
            <Box>{list}</Box>
            <LaunchPanel branch={LAUNCH_TARGET} locked={locked} />
          </SimpleGrid>
        ) : (
          <>
            {list}
            <LaunchPanel branch={LAUNCH_TARGET} locked={locked} />
          </>
        )}
      </Stack>
    </AppFrame>
  );
}

const SB_LIVE: Session = {
  repo: 'switchboard',
  branch: 'feature/remote-control',
  model: 'opus 4.8',
  endpoint: 'remote-control · ready',
  status: 'running',
  started: 'started 2m ago',
};
const SB_IDLE: Session = {
  repo: 'switchboard',
  branch: 'fix/clone-retry',
  model: 'sonnet 4.6',
  endpoint: 'remote-control · idle',
  status: 'idle',
  started: 'started 1h ago',
};
const WF_LIVE: Session = {
  repo: 'widget-factory',
  branch: 'main',
  model: 'opus 4.8',
  endpoint: 'remote-control · ready',
  status: 'running',
  started: 'started 12m ago',
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

/** Handoff — sessions grouped by repo; the new one is live and the toast points to the mobile app. */
export const MobileHandoff: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Sessions
        sessions={[SB_LIVE, SB_IDLE, WF_LIVE]}
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
        sessions={[SB_IDLE]}
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

/** Desktop variant — grouped sessions and the launch panel side by side, with the handoff toast. */
export const Desktop: Story = {
  render: () => (
    <Frame width={DESKTOP}>
      <Sessions
        sessions={[SB_LIVE, SB_IDLE, WF_LIVE]}
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
