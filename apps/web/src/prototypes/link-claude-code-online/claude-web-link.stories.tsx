import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { Box, Group, Stack, Text, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { Plug, type PlugStatus } from '../../ui/plug';
import { IconButton } from '../../ui/controls';
import { definePrototypeMeta } from '../define-prototype-meta';

/**
 * Prototype for `link-claude-code-online`: the "open in Claude web" affordance that deep-links a
 * LIVE session to `https://claude.ai/code/<bridgeSessionId>`. Explores (1) where the link sits in
 * the worktree row, (2) how it behaves across session states — crucially it is ABSENT until the
 * cloud bridge id resolves, appearing on a later liveness poll — and (3) its resting/hover icon
 * treatment. Composes the production `Plug` and `IconButton` from the catalogue; the link itself is
 * the gap the catalogue lacks (an anchor, not a button), sketched here as `ClaudeWebLink`.
 */

// An "open in new tab" glyph, drawn in the same 20x20 stroked style as WorktreesView's glyphs.
function ExternalGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8.5 5 H6 a1 1 0 0 0 -1 1 V14 a1 1 0 0 0 1 1 H14 a1 1 0 0 0 1 -1 V11.5" />
      <path d="M11 5 H15 V9" />
      <path d="M15 5 L9.5 10.5" />
    </svg>
  );
}

/**
 * The affordance: an anchor styled like the catalogue `IconButton` resting state, in the patina
 * accent (the live-session colour). Opens claude.ai/code in a new tab. Rendered ONLY when a bridge
 * id is known — the caller passes `undefined` to mean "no link yet" and renders nothing.
 */
function ClaudeWebLink({
  bridgeSessionId,
  label = 'Open in Claude web',
  size = 30,
}: {
  bridgeSessionId: string;
  label?: string;
  size?: number;
}) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const [hover, setHover] = useState(false);
  const ramp = theme.colors.patina;
  const accent = ramp[dark ? 4 : 6];
  const iconColor = hover ? '#fff' : accent;
  const background = hover ? accent : dark ? 'rgba(120,170,150,0.18)' : 'rgba(70,120,95,0.10)';
  const border = `1px solid ${accent}`;
  return (
    <Box
      component="a"
      href={`https://claude.ai/code/${bridgeSessionId}`}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      data-testid="claude-web-link"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        background,
        border,
        color: iconColor,
        textDecoration: 'none',
        boxShadow: hover
          ? `0 0 8px ${dark ? 'rgba(120,170,150,0.6)' : 'rgba(70,120,95,0.4)'}`
          : undefined,
      }}
    >
      <ExternalGlyph />
    </Box>
  );
}

const TrashGlyph = () => (
  <svg
    width={15}
    height={15}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M4 6 H16" />
    <path d="M8 6 V4.5 a1 1 0 0 1 1-1 h2 a1 1 0 0 1 1 1 V6" />
    <path d="M6 6 V15.5 a1 1 0 0 0 1 1 h6 a1 1 0 0 0 1-1 V6" />
  </svg>
);

type Placement = 'beside-plug' | 'far-right';

/** A worktree row mirroring WorktreesView's anatomy: branch + plug + lamps + (link) + delete. */
function Row({
  branch,
  status,
  bridgeSessionId,
  placement = 'beside-plug',
  note,
}: {
  branch: string;
  status: PlugStatus;
  bridgeSessionId?: string;
  placement?: Placement;
  note?: ReactNode;
}) {
  const link = bridgeSessionId ? <ClaudeWebLink bridgeSessionId={bridgeSessionId} /> : null;
  return (
    <Box px="md" py="sm" style={{ borderTop: '1px solid var(--sb-divider)' }}>
      <Group justify="space-between" wrap="nowrap">
        <Text fz="sm" fw={700} ff="monospace" truncate>
          {branch}
        </Text>
        {note && (
          <Text fz="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {note}
          </Text>
        )}
      </Group>
      <Group justify="space-between" wrap="nowrap" mt={8} align="center">
        <Group gap={14} wrap="nowrap" align="center">
          <Plug status={status} size={26} label={branch} onActivate={() => {}} />
          {placement === 'beside-plug' && link}
          {/* lamp stand-ins to anchor the row rhythm */}
          <Box
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: '1.5px solid var(--sb-screw)',
            }}
          />
          <Box
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: '1.5px solid var(--sb-screw)',
            }}
          />
        </Group>
        <Group gap={10} wrap="nowrap" align="center">
          {placement === 'far-right' && link}
          <IconButton icon={<TrashGlyph />} label="Delete worktree" color="signal" />
        </Group>
      </Group>
    </Box>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      style={{
        maxWidth: 420,
        margin: '24px auto',
        border: '1px solid var(--sb-divider)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--sb-panel, transparent)',
      }}
    >
      <Box px="md" pt="md" pb="xs">
        <Text fz="xs" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
          {title}
        </Text>
      </Box>
      {children}
    </Box>
  );
}

const SESSION_ID = 'session_011M7D8EPisCss4xNqQ4PNiQ';

const meta = {
  ...definePrototypeMeta({ component: Row, parameters: { layout: 'fullscreen' } }),
} satisfies Meta<typeof Row>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Recommended placement: the link sits immediately right of the plug, on a live, resolved session. */
export const RecommendedPlacement: Story = {
  render: () => (
    <Frame title="acme/widgets">
      <Row branch="feat/login-form" status="running" bridgeSessionId={SESSION_ID} />
      <Row
        branch="fix/header-count"
        status="running"
        bridgeSessionId="session_01XutqRB9rvK3DfSpP7hbSZj"
      />
    </Frame>
  ),
};

/**
 * Across session states. The link is ABSENT for off/starting, and absent for a live session whose
 * bridge id has not resolved yet (the realistic post-launch window) — it only appears once the
 * cloud id is known. This is the core behaviour the prototype validates.
 */
export const AcrossSessionStates: Story = {
  render: () => (
    <Frame title="states — link appears only when the bridge id is known">
      <Row branch="off — no session" status="off" note="no link" />
      <Row branch="starting — launch in flight" status="working" note="no link (guarded)" />
      <Row branch="on — bridge not connected yet" status="running" note="no link yet" />
      <Row
        branch="on — bridge id resolved"
        status="running"
        bridgeSessionId={SESSION_ID}
        note="link ↗"
      />
      <Row branch="error — launch/stop failed" status="error" note="no link" />
    </Frame>
  ),
};

/** Placement options compared: beside the plug (left group) vs. far-right by the delete control. */
export const PlacementOptions: Story = {
  render: () => (
    <Stack gap={0}>
      <Frame title="A — beside the plug (recommended)">
        <Row
          branch="feat/login-form"
          status="running"
          bridgeSessionId={SESSION_ID}
          placement="beside-plug"
        />
      </Frame>
      <Frame title="B — far right, by the delete control">
        <Row
          branch="feat/login-form"
          status="running"
          bridgeSessionId={SESSION_ID}
          placement="far-right"
        />
      </Frame>
    </Stack>
  ),
};
