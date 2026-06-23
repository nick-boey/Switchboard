import {
  ActionIcon,
  Box,
  Group,
  SimpleGrid,
  Stack,
  Text,
  useComputedColorScheme,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import { AppFrame, DeviceFrame, EmbossedLabel, flat, Panel, StatusLight } from './kit';

/** A left-pointing chevron for the back button — no icon library, so an inline glyph. */
const ChevronLeft = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12.5 5 L7.5 10 L12.5 15" />
  </svg>
);

/**
 * The **Settings** page — reached from the drawer's Settings button. A read-only stub for the MVP:
 * the GitHub PAT and bearer token are written to `~/.switchboard` out-of-band by the CLI, so this
 * surface only *reports* connection state and where clones live. No editable controls yet. Mobile +
 * desktop. Static fake data only.
 *
 * Click actions: ‹ Worktrees → back to the hub. (All fields are read-only in the MVP.)
 */

/** A labelled read-only setting: a name, a value (mono), and an optional status lamp. */
function SettingRow({
  label,
  value,
  tone,
  note,
  divider = true,
}: {
  label: string;
  value: string;
  tone?: 'green' | 'yellow' | 'red' | 'neutral';
  note?: string;
  /** Top divider — off for the first row so the pressed panel has no rule flush to its top edge. */
  divider?: boolean;
}) {
  return (
    <Box
      py={9}
      px={6}
      style={{ borderTop: divider ? '1px solid rgba(128,128,128,0.25)' : undefined }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fz="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
            {label}
          </Text>
          <Text fz="sm" ff="monospace" truncate>
            {value}
          </Text>
          {note && (
            <Text fz="xs" c="dimmed">
              {note}
            </Text>
          )}
        </Box>
        {tone && (
          <Box style={{ flex: 'none', paddingTop: 2 }}>
            <StatusLight tone={tone} />
          </Box>
        )}
      </Group>
    </Box>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel>
      <EmbossedLabel>{title}</EmbossedLabel>
      <Panel pressed p="xs" mt="sm">
        <Stack gap={0}>{children}</Stack>
      </Panel>
    </Panel>
  );
}

function Settings({ desktop = false }: { desktop?: boolean }) {
  const status = (
    <Group gap={8} wrap="nowrap">
      <StatusLight tone="green" size={11} />
      <Text fz="xs" fw={600}>
        connected
      </Text>
    </Group>
  );

  const header = (
    <Group gap="xs" wrap="nowrap" align="center">
      <ActionIcon variant="subtle" color="gray" aria-label="Back to worktrees">
        <ChevronLeft />
      </ActionIcon>
      <Text fz="lg" fw={700}>
        Settings
      </Text>
    </Group>
  );

  const github = (
    <SettingsGroup title="GitHub">
      <SettingRow
        label="Account"
        value="nick-boey"
        tone="green"
        note="authenticated via PAT"
        divider={false}
      />
      <SettingRow
        label="Personal access token"
        value="ghp_••••••••••••3f2a"
        tone="green"
        note="read from ~/.switchboard"
      />
    </SettingsGroup>
  );

  const storage = (
    <SettingsGroup title="Storage">
      <SettingRow
        label="Clone location"
        value="~/.switchboard/repos/<org>/<repo>"
        note="bare clone in /.bare, worktrees alongside"
        divider={false}
      />
      <SettingRow label="Repositories cloned" value="3" />
    </SettingsGroup>
  );

  const access = (
    <SettingsGroup title="Remote access">
      <SettingRow
        label="Bearer token"
        value="sb_••••••••••••9c41"
        tone="green"
        note="written to ~/.switchboard by the CLI"
        divider={false}
      />
      <SettingRow label="Tailscale serve" value="switchboard.tailnet.ts.net" tone="green" />
    </SettingsGroup>
  );

  return (
    <AppFrame status={status}>
      <Stack gap="md">
        {header}
        {desktop ? (
          <SimpleGrid cols={2} spacing="md">
            {github}
            {storage}
            {access}
          </SimpleGrid>
        ) : (
          <>
            {github}
            {storage}
            {access}
          </>
        )}
      </Stack>
    </AppFrame>
  );
}

const meta = {
  ...definePrototypeMeta({
    component: Settings,
    parameters: { layout: 'fullscreen' },
  }),
} satisfies Meta<typeof Settings>;

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

/** Mobile — connection + storage status, stacked. */
export const Mobile: Story = {
  render: () => (
    <Frame width={PHONE}>
      <Settings />
    </Frame>
  ),
};

/** Desktop — the same settings groups in a two-column layout. */
export const Desktop: Story = {
  render: () => (
    <Frame width={DESKTOP}>
      <Settings desktop />
    </Frame>
  ),
};
