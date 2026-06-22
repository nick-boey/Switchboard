import {
  Box,
  Button,
  Group,
  Progress,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineTheme,
  type BoxProps,
} from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';

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

/** Neutral hairline divider that reads on both light and dark surfaces. */
export const FLAT_DIVIDER = 'rgba(128,128,128,0.25)';

/**
 * Flat neutral surface scheme — the bakelite/warm tones removed. Only surfaces, grounds, and borders
 * go neutral; the functional accent colours (patina/brass/signal + the cobalt lamp) and the patina
 * brand bar stay. Local to the prototypes (theme tokens are out of bounds for sketches).
 */
export interface FlatScheme {
  /** Page background behind the device frame. */
  ground: string;
  /** App body inside the frame. */
  body: string;
  /** Raised card. */
  surface: string;
  /** Recessed well. */
  well: string;
  /** Card / frame outline. */
  border: string;
  /** Corner-screw outline circle. */
  screw: string;
  /** Drawer rail. */
  rail: string;
  /** Body text. */
  text: string;
  /** Subtle hover/selected wash. */
  subtle: string;
}

export function flat(dark: boolean): FlatScheme {
  return dark
    ? {
        ground: '#101010',
        body: '#181818',
        surface: '#212121',
        well: '#1a1a1a',
        border: 'rgba(255,255,255,0.14)',
        screw: 'rgba(255,255,255,0.30)',
        rail: '#151515',
        text: '#e6e6e6',
        subtle: 'rgba(255,255,255,0.06)',
      }
    : {
        ground: '#ececeb',
        body: '#f6f6f4',
        surface: '#ffffff',
        well: '#f2f2f0',
        border: 'rgba(0,0,0,0.14)',
        screw: 'rgba(0,0,0,0.26)',
        rail: '#ececeb',
        text: '#1f1f1f',
        subtle: 'rgba(0,0,0,0.05)',
      };
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
const ALL_CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

function Screws({ dark, corners }: { dark: boolean; corners: Corner[] }) {
  const br = flat(dark).screw;
  const inset = 6;
  const base: CSSProperties = {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'transparent',
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
 * The flat panel: a slightly rounded neutral surface with a 1px outline and (for raised cards) four
 * corner-screw outline circles. Scheme-adaptive — white in light, charcoal in dark. Every screen
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
  const dark = useComputedColorScheme('light') === 'dark';
  const f = flat(dark);
  const showScrews = (screws ?? !pressed) && corners.length > 0;
  const surface = pressed ? f.well : f.surface;
  const border = pressed ? FLAT_DIVIDER : f.border;
  return (
    <Box
      p={p}
      style={{
        position: 'relative',
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: PANEL_RADIUS,
        color: f.text,
        boxShadow: 'none',
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
  const ring = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  const inner: Record<PlugStatus, string> = {
    running: theme.colors.patina[6],
    working: theme.colors.brass[6],
    error: theme.colors.signal[6],
    idle: dark ? '#5c5c5c' : '#c4c4c4',
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
  const dark = useComputedColorScheme('light') === 'dark';
  return (
    <Box
      component="span"
      style={{
        display: 'inline-block',
        color: dark ? '#cfcfcf' : '#525252',
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
  const dark = useComputedColorScheme('light') === 'dark';
  const f = flat(dark);
  return (
    <Box
      style={
        {
          width,
          maxWidth: '100%',
          borderRadius: PANEL_RADIUS + 2,
          overflow: 'hidden',
          background: f.body,
          boxShadow: dark ? '0 6px 20px rgba(0,0,0,0.55)' : '0 6px 20px rgba(0,0,0,0.14)',
          border: `1px solid ${f.border}`,
          // Neutralise Mantine input/default surfaces (theme `white` is the cream we're removing).
          '--mantine-color-white': '#ffffff',
          '--mantine-color-default': f.surface,
          '--mantine-color-default-hover': f.well,
          '--mantine-color-default-border': f.border,
          '--mantine-color-body': f.body,
        } as CSSProperties
      }
    >
      {label && (
        <Box
          px="sm"
          py={6}
          style={{
            background: dark ? '#2a2a2a' : '#e4e4e4',
            color: dark ? '#e6e6e6' : '#333333',
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
  const dark = useComputedColorScheme('light') === 'dark';
  const f = flat(dark);
  return (
    <Box style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Group
        justify="space-between"
        wrap="nowrap"
        px="md"
        py="sm"
        style={{
          background: theme.colors.patina[8],
          color: '#f4f4f4',
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
      <Box style={{ flex: 1, minHeight: 460, background: f.body }} p="md">
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
                style={{ borderTop: i === 0 ? undefined : `1px solid ${FLAT_DIVIDER}` }}
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
                    {op.status === 'failed' && (
                      <Group gap="xs" mt={8}>
                        <Button size="compact-xs" variant="default">
                          Retry
                        </Button>
                        <Button size="compact-xs" variant="subtle" color="gray">
                          Dismiss
                        </Button>
                      </Group>
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

// --- Hub indicator primitives ----------------------------------------------
// Added for the worktrees-hub redesign. The hub needs a richer status lamp than `IndicatorLamp`
// (five tones incl. a blue with no equivalent in `theme.ts`) and small symbol glyphs that caption
// what each indicator column means. Kept here as flat-language primitives; the composed hub
// components (cards, rows, drawer, modals) live in `hub.tsx`.

/** The five indicator-light tones. `blue` is local to the prototypes — there is no blue in theme.ts. */
export type LightTone = 'neutral' | 'yellow' | 'green' | 'red' | 'blue';

/** Cobalt for the PR-exists lamp. Local constant (touching theme tokens is out of bounds for sketches). */
const COBALT = { light: '#2f6aa8', dark: '#6ba6e0' };

/**
 * A flat indicator light — a bezel-ringed lamp whose bulb is coloured by `tone` and glows softly when
 * lit. The hub's git-status and PR-status indicators. `neutral` reads as an unlit/empty socket
 * (git "up to date" / "no PR"). `label` makes it an accessible status image when used on its own.
 */
export function StatusLight({
  tone = 'neutral',
  size = 14,
  label,
}: {
  tone?: LightTone;
  size?: number;
  label?: string;
}) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const hue: Record<Exclude<LightTone, 'neutral'>, string> = {
    yellow: theme.colors.brass[dark ? 4 : 6],
    green: theme.colors.patina[dark ? 4 : 6],
    red: theme.colors.signal[dark ? 4 : 6],
    blue: dark ? COBALT.dark : COBALT.light,
  };
  const off = tone === 'neutral';
  const bezel = dark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.42)';
  const fill = off ? (dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)') : hue[tone];
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `1.5px solid ${bezel}`,
        background: fill,
        boxShadow: off ? 'none' : `0 0 ${Math.round(size * 0.5)}px ${fill}`,
        display: 'inline-block',
        flex: 'none',
      }}
    />
  );
}

export type IndicatorKind = 'plug' | 'git' | 'pr';

/**
 * A small monochrome glyph captioning what an indicator column means — the "symbols above the lights"
 * the brief calls for. Renders in `currentColor`, so the parent sets the tone. `plug` is a power
 * symbol (Claude on/off), `git` a branch, `pr` a branch merging back.
 */
export function IndicatorSymbol({ kind, size = 14 }: { kind: IndicatorKind; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'plug') {
    return (
      <svg {...common}>
        <path d="M8 2.4 V7" />
        <path d="M4.6 4.8 a4.6 4.6 0 1 0 6.8 0" />
      </svg>
    );
  }
  if (kind === 'git') {
    return (
      <svg {...common}>
        <circle cx="4.5" cy="3.5" r="1.5" />
        <circle cx="4.5" cy="12.5" r="1.5" />
        <circle cx="11.5" cy="6" r="1.5" />
        <path d="M4.5 5 V11" />
        <path d="M11.5 7.5 C 11.5 10, 8 9.4, 5.6 11.1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle cx="11.5" cy="12.5" r="1.5" />
      <path d="M4.5 5 V11" />
      <path d="M6 4.4 H8.6 a3 3 0 0 1 3 3 V11" />
    </svg>
  );
}
