import {
  Box,
  Group,
  Progress,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineTheme,
  type BoxProps,
} from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';
import type { SwitchboardTokens } from '../../theme/theme';

/**
 * Shared sketch kit for the `ui-prototypes-mvp` prototypes — the FLAT, abstract take on the '50s
 * switchboard language (the skeuomorphic emboss pass is in git history at commit 4256e99). Same
 * influences — bakelite/patina/brass/signal palette, plug + screw + nameplate motifs — but rendered
 * as flat surfaces with light outlines instead of heavy emboss shadows:
 *
 *  - Panels: very slightly rounded, 1px outline, four small corner "screw" dots (raised cards only).
 *  - Plug: a thin outer ring + a thick inner disc coloured by status (the line/session indicator).
 *  - Inset titles (EmbossedLabel): a subtle recessed nameplate — used ONLY inside raised cards;
 *    elsewhere a plain SectionTitle differentiates sections.
 *
 * These are NOT production primitives; promoting any into `src/components/` + `theme.ts` is
 * implementation work owned by the feature changes. Plain `.tsx` (not `*.stories.tsx`) so the
 * workbench indexer ignores it.
 */

/** Very slightly rounded — the house panel radius for the flat language. */
export const PANEL_RADIUS = 6;

const DARK_SURFACE = '#2a241d';
const DARK_WELL = '#211c16';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
const ALL_CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

function Screws({ dark, corners }: { dark: boolean; corners: Corner[] }) {
  const bg = dark ? '#15110c' : '#e7d9bd';
  const br = dark ? 'rgba(255,255,255,0.20)' : 'rgba(60,45,20,0.38)';
  const inset = 6;
  const base: CSSProperties = {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: bg,
    border: `1px solid ${br}`,
  };
  const pos: Record<Corner, CSSProperties> = {
    tl: { top: inset, left: inset },
    tr: { top: inset, right: inset },
    bl: { bottom: inset, left: inset },
    br: { bottom: inset, right: inset },
  };
  return (
    <>
      {corners.map((c) => (
        <span key={c} style={{ ...base, ...pos[c] }} />
      ))}
    </>
  );
}

export interface PanelProps extends BoxProps {
  children?: ReactNode;
  /** Recessed well (subtle inset background) instead of a raised card. Wells carry no screws. */
  pressed?: boolean;
  /** Show corner screws. Defaults to true for raised cards, false for wells. */
  screws?: boolean;
  /** Which corners get screws (default all four) — used to collapse screws when panels are stacked. */
  corners?: Corner[];
  'data-testid'?: string;
}

/**
 * The flat embossed-bakelite panel: a slightly rounded surface with a 1px outline and (for raised
 * cards) four corner screws. Scheme-adaptive — cream in light, charcoal in dark. Every screen
 * region is one of these.
 */
export function Panel({
  children,
  pressed = false,
  screws,
  corners = ALL_CORNERS,
  p = 'lg',
  style,
  ...rest
}: PanelProps) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const showScrews = (screws ?? !pressed) && corners.length > 0;
  const surface = pressed
    ? dark
      ? DARK_WELL
      : 'rgba(60,45,20,0.05)'
    : dark
      ? DARK_SURFACE
      : theme.colors.bakelite[0];
  const border = pressed
    ? dark
      ? 'rgba(0,0,0,0.45)'
      : 'rgba(60,45,20,0.14)'
    : dark
      ? 'rgba(255,255,255,0.13)'
      : 'rgba(60,45,20,0.22)';
  return (
    <Box
      p={p}
      style={{
        position: 'relative',
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: PANEL_RADIUS,
        color: dark ? theme.colors.bakelite[1] : theme.black,
        boxShadow: pressed ? 'inset 0 1px 2px rgba(0,0,0,0.10)' : 'none',
        ...style,
      }}
      {...rest}
    >
      {showScrews && <Screws dark={dark} corners={corners} />}
      {children}
    </Box>
  );
}

export type PlugStatus = 'running' | 'idle' | 'working' | 'error' | 'off';

/**
 * The plug/jack — a thin outer ring around a thick inner disc, the disc coloured by status (plan's
 * line/session indicator). Replaces the skeuomorphic socket; reads as an abstract patch point.
 */
export function Plug({
  status = 'idle',
  size = 20,
  label,
}: {
  status?: PlugStatus;
  size?: number;
  label?: string;
}) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const ring = dark ? 'rgba(255,255,255,0.5)' : 'rgba(60,45,20,0.55)';
  const inner: Record<PlugStatus, string> = {
    running: theme.colors.patina[6],
    working: theme.colors.brass[6],
    error: theme.colors.signal[6],
    idle: dark ? theme.colors.bakelite[7] : theme.colors.bakelite[4],
    off: 'transparent',
  };
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `1.5px solid ${ring}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <span
        style={{
          width: size * 0.56,
          height: size * 0.56,
          borderRadius: '50%',
          background: inner[status],
          border: status === 'off' ? `1px solid ${ring}` : undefined,
        }}
      />
    </span>
  );
}

export type LampColor = 'signal' | 'patina' | 'brass';

/**
 * A flat status dot — a small filled circle with a thin ring, coloured by `color`. The lightweight
 * inline status marker for ledger rows, list items, and empty states. (Flat replacement for the
 * old glowing lamp; name kept so existing stories keep working.)
 */
export function IndicatorLamp({
  color = 'signal',
  lit = false,
  size = 12,
  label,
}: {
  color?: LampColor;
  lit?: boolean;
  size?: number;
  label?: string;
}) {
  const theme = useMantineTheme();
  const hue = theme.colors[color];
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-block',
        flex: 'none',
        background: lit ? hue[5] : 'transparent',
        border: `1px solid ${lit ? hue[6] : hue[7]}`,
      }}
    />
  );
}

/**
 * A flat inset nameplate — a subtly recessed strip with uppercase tracked type. The "inset title"
 * the brief keeps, used ONLY inside raised cards. For section headers outside a raised card, use
 * `SectionTitle` (plain text) instead.
 */
export function EmbossedLabel({ children, ...rest }: { children: ReactNode } & BoxProps) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  return (
    <Box
      px={8}
      py={2}
      style={{
        display: 'inline-block',
        background: dark ? 'rgba(0,0,0,0.22)' : 'rgba(60,45,20,0.06)',
        border: `1px solid ${dark ? 'rgba(0,0,0,0.30)' : 'rgba(60,45,20,0.12)'}`,
        borderRadius: 4,
        color: dark ? theme.colors.brass[4] : theme.colors.brass[8],
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        fontSize: '0.66rem',
        fontWeight: 700,
        lineHeight: 1.6,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}

/** A plain-text section/group header — used to differentiate groups OUTSIDE raised cards. */
export function SectionTitle({ children, ...rest }: { children: ReactNode } & BoxProps) {
  return (
    <Text fz="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.14em' }} {...rest}>
      {children}
    </Text>
  );
}

/**
 * Frames a screen sketch as a device so mobile and desktop variants read at a glance. `width` sets
 * the viewport; the ground adapts to the colour scheme. Light brass outline, minimal shadow.
 */
export function DeviceFrame({
  width,
  label,
  children,
}: {
  width: number;
  /** Optional meta caption strip. Omit when the framed content has its own header (e.g. AppFrame). */
  label?: string;
  children: ReactNode;
}) {
  const theme = useMantineTheme();
  return (
    <Box
      style={{
        width,
        maxWidth: '100%',
        borderRadius: PANEL_RADIUS + 2,
        overflow: 'hidden',
        background: 'var(--mantine-color-body)',
        boxShadow: '0 6px 18px rgba(20,15,5,0.22)',
        border: `1px solid ${theme.colors.brass[7]}`,
      }}
    >
      {label && (
        <Box
          px="sm"
          py={6}
          style={{
            background: theme.colors.patina[8],
            color: theme.colors.bakelite[0],
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            fontSize: '0.62rem',
            fontWeight: 700,
          }}
        >
          {label}
        </Box>
      )}
      {children}
    </Box>
  );
}

/**
 * The in-screen app chrome shared by all three flow screens: a patina brand bar (plug + tracked
 * wordmark + an optional right-hand status slot) over a body on the room-coloured ground. The body
 * grows with content so a static sketch shows the whole screen at once. `toast` overlays the bottom.
 */
export function AppFrame({
  title = 'Switchboard',
  status,
  toast,
  children,
}: {
  title?: string;
  status?: ReactNode;
  toast?: ReactNode;
  children: ReactNode;
}) {
  const theme = useMantineTheme();
  return (
    <Box style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Group
        justify="space-between"
        wrap="nowrap"
        px="md"
        py="sm"
        style={{
          background: theme.colors.patina[8],
          color: theme.colors.bakelite[0],
          flex: 'none',
        }}
      >
        <Group gap="sm" wrap="nowrap">
          <Plug status="running" size={18} label="Operator line" />
          <Text
            fw={700}
            tt="uppercase"
            style={{ letterSpacing: '0.24em', fontSize: '0.95rem', lineHeight: 1 }}
          >
            {title}
          </Text>
        </Group>
        {status}
      </Group>
      <Box style={{ flex: 1, minHeight: 460, background: 'var(--mantine-color-body)' }} p="md">
        {children}
      </Box>
      {toast && (
        <Box style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 10 }}>
          {toast}
        </Box>
      )}
    </Box>
  );
}

/**
 * A transient snackbar — the session-handoff instruction (plan Decision 7). A left status accent, a
 * title, body copy, and a dismiss. No screws (a snackbar is not a bolted plate).
 */
export function Toast({
  tone = 'patina',
  title,
  children,
}: {
  tone?: LampColor;
  title: string;
  children?: ReactNode;
}) {
  const theme = useMantineTheme();
  return (
    <Panel p="sm" screws={false} style={{ borderLeft: `4px solid ${theme.colors[tone][6]}` }}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Box mt={3}>
          <IndicatorLamp color={tone} lit size={12} label={title} />
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fz="sm" fw={700}>
            {title}
          </Text>
          {children && (
            <Text fz="xs" c="dimmed" mt={2}>
              {children}
            </Text>
          )}
        </Box>
        <Text fz="lg" c="dimmed" style={{ cursor: 'pointer', lineHeight: 1 }} aria-label="Dismiss">
          ×
        </Text>
      </Group>
    </Panel>
  );
}

export type OperationStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Operation {
  id: string;
  /** What the operation is doing, e.g. "Clone acme/widget-factory". */
  label: string;
  status: OperationStatus;
  /** Sub-line: percent text, branch, or an error message. */
  detail?: string;
  /** 0–100 for a running operation; omit for an indeterminate or non-running op. */
  progress?: number;
}

const LAMP_FOR: Record<OperationStatus, { color: LampColor; lit: boolean }> = {
  queued: { color: 'patina', lit: false },
  running: { color: 'brass', lit: true },
  done: { color: 'patina', lit: true },
  failed: { color: 'signal', lit: true },
};

const BAR_COLOR: Record<OperationStatus, string> = {
  queued: 'gray',
  running: 'brass',
  done: 'patina',
  failed: 'signal',
};

/**
 * The operation ledger (plan Decision 3): the running record of long operations — clone, worktree
 * create, session launch — that every flow screen surfaces. A `locked` ledger shows the "LINE BUSY"
 * marker, the single-writer lock that gates further mutating actions while one is in flight.
 */
export function OperationLedger({ ops, locked = false }: { ops: Operation[]; locked?: boolean }) {
  return (
    <Panel>
      <Group justify="space-between" align="center" mb="sm">
        <EmbossedLabel>Operation ledger</EmbossedLabel>
        {locked && (
          <Group gap={6} align="center">
            <IndicatorLamp color="signal" lit size={10} label="line busy" />
            <Text fz={11} fw={700} tt="uppercase" c="signal.7" style={{ letterSpacing: '0.12em' }}>
              Line busy
            </Text>
          </Group>
        )}
      </Group>
      <Panel pressed p="xs">
        <Stack gap={0}>
          {ops.map((op, i) => {
            const lamp = LAMP_FOR[op.status];
            return (
              <Box
                key={op.id}
                py={8}
                px={6}
                style={{ borderTop: i === 0 ? undefined : '1px solid rgba(120,90,40,0.18)' }}
              >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Box mt={3}>
                    <IndicatorLamp color={lamp.color} lit={lamp.lit} size={12} label={op.status} />
                  </Box>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Text fz="sm" fw={600} truncate>
                        {op.label}
                      </Text>
                      <Text fz={11} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                        {op.status}
                      </Text>
                    </Group>
                    {op.detail && (
                      <Text
                        fz="xs"
                        ff="monospace"
                        c={op.status === 'failed' ? 'signal.7' : 'dimmed'}
                        mt={2}
                      >
                        {op.detail}
                      </Text>
                    )}
                    {op.status === 'running' && (
                      <Progress
                        value={op.progress ?? 100}
                        color={BAR_COLOR[op.status]}
                        size="sm"
                        mt={6}
                        animated={op.progress === undefined}
                        striped={op.progress === undefined}
                      />
                    )}
                  </Box>
                </Group>
              </Box>
            );
          })}
        </Stack>
      </Panel>
    </Panel>
  );
}
