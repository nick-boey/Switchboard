import {
  Box,
  Group,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineTheme,
  type BoxProps,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
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

/** The accent colours an {@link IconButton} can take. `neutral` is a quiet grey for non-accented actions. */
export type AccentColor = 'signal' | 'patina' | 'brass' | 'neutral';

/** rgb triples for the accent washes (theme hexes converted once — theme tokens stay out of bounds). */
const ACCENT_RGB: Record<Exclude<AccentColor, 'neutral'>, string> = {
  signal: '199,42,31', // signal[7]
  patina: '44,147,135', // patina[6]
  brass: '208,150,0', // brass[6]
};

/**
 * A slightly-rounded square icon button — the generalised form of the worktree delete control. Takes
 * any glyph and accent colour. By default it sits back as a soft wash of its colour that lightens on
 * hover; `lit` fills it solid with a soft glow (the "this is now the obvious action" state, e.g. a
 * delete that is finally safe to run).
 */
export function IconButton({
  icon,
  label,
  color = 'neutral',
  lit = false,
  size = 30,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  color?: AccentColor;
  lit?: boolean;
  size?: number;
  onClick?: () => void;
}) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const { hovered, ref } = useHover<HTMLButtonElement>();
  const rgb = color === 'neutral' ? (dark ? '230,230,230' : '40,40,40') : ACCENT_RGB[color];
  const ramp = color === 'neutral' ? null : theme.colors[color];
  const soft = (a: number) => `rgba(${rgb},${a})`;
  const background = lit
    ? hovered
      ? (ramp?.[5] ?? '#7d7d7d')
      : (ramp?.[6] ?? (dark ? '#6a6a6a' : '#717171'))
    : soft(hovered ? (dark ? 0.34 : 0.2) : dark ? 0.22 : 0.12);
  const iconColor = lit ? '#fff' : (ramp?.[dark ? 4 : 7] ?? (dark ? '#d8d8d8' : '#3a3a3a'));
  const border = lit ? (ramp?.[dark ? 5 : 7] ?? 'transparent') : soft(dark ? 0.5 : 0.38);
  return (
    <Box
      ref={ref}
      component="button"
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        cursor: 'pointer',
        background,
        border: `1px solid ${border}`,
        color: iconColor,
        boxShadow: lit ? `0 0 10px rgba(${rgb},${dark ? 0.55 : 0.45})` : 'none',
        transition: 'background 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
      }}
    >
      {icon}
    </Box>
  );
}

/**
 * A sunken tab/segment toggle — a recessed track with the active segment raised as a pill. The flat
 * language's replacement for Mantine's `SegmentedControl`; its label type matches the small input
 * text (sm / weight 400) so it reads as a quiet control rather than a button bar. Disabled options
 * (e.g. a deferred-for-MVP path) render greyed and non-interactive.
 */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  fullWidth = false,
}: {
  value: T;
  onChange?: (value: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  fullWidth?: boolean;
}) {
  const dark = useComputedColorScheme('light') === 'dark';
  const f = flat(dark);
  return (
    <Box
      style={{
        display: 'inline-flex',
        width: fullWidth ? '100%' : undefined,
        gap: 3,
        padding: 3,
        borderRadius: PANEL_RADIUS,
        background: f.well,
        border: `1px solid ${FLAT_DIVIDER}`,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Box
            key={opt.value}
            component="button"
            type="button"
            disabled={opt.disabled}
            aria-pressed={active}
            onClick={() => !opt.disabled && onChange?.(opt.value)}
            style={{
              flex: fullWidth ? 1 : 'none',
              padding: '5px 14px',
              borderRadius: PANEL_RADIUS - 2,
              border: `1px solid ${active ? f.border : 'transparent'}`,
              background: active ? f.surface : 'transparent',
              color: active ? f.text : dark ? '#9a9a9a' : '#6a6a6a',
              fontSize: 'var(--mantine-font-size-sm)',
              fontWeight: 400,
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              opacity: opt.disabled ? 0.4 : 1,
              boxShadow: active
                ? dark
                  ? '0 1px 2px rgba(0,0,0,0.4)'
                  : '0 1px 2px rgba(0,0,0,0.12)'
                : 'none',
              transition: 'background 120ms ease, color 120ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </Box>
        );
      })}
    </Box>
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

// --- Hub indicator primitives ----------------------------------------------
// The hub's status lamp (richer than a plain dot — five tones incl. a blue with no equivalent in
// `theme.ts`) plus the small symbol glyphs that caption what each indicator column means, and the
// `IndicatorLight` that pairs them. Flat-language primitives; the composed hub components (cards,
// rows, drawer, modals) live in `hub.tsx`.

/** The indicator-light tones. `blue`/`purple` are local to the prototypes — neither exists in theme.ts. */
export type LightTone = 'neutral' | 'yellow' | 'green' | 'red' | 'blue' | 'purple';

/** Cobalt for the PR-open lamp. Local constant (touching theme tokens is out of bounds for sketches). */
const COBALT = { light: '#2f6aa8', dark: '#6ba6e0' };
/** Violet for the PR-merged lamp — the universal "merged" colour. Local for the same reason. */
const VIOLET = { light: '#7048c4', dark: '#a78bea' };

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
    purple: dark ? VIOLET.dark : VIOLET.light,
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

/**
 * A {@link StatusLight} captioned by a small symbol — the indicator the hub uses for its git/PR
 * columns. The glyph sits above the light (default) or beside it (`inline`); both are centred so a
 * row of them lines up. Pass either a `kind` (renders the matching {@link IndicatorSymbol}) or an
 * arbitrary `symbol` node.
 */
export function IndicatorLight({
  kind,
  symbol,
  tone = 'neutral',
  size = 8,
  symbolSize = 10,
  inline = false,
  label,
}: {
  kind?: IndicatorKind;
  symbol?: ReactNode;
  tone?: LightTone;
  size?: number;
  symbolSize?: number;
  inline?: boolean;
  label?: string;
}) {
  const glyph = symbol ?? (kind && <IndicatorSymbol kind={kind} size={symbolSize} />);
  const content = (
    <>
      {glyph && (
        <Box c="dimmed" style={{ lineHeight: 0 }}>
          {glyph}
        </Box>
      )}
      <StatusLight tone={tone} size={size} label={label} />
    </>
  );
  return inline ? (
    <Group gap={6} wrap="nowrap" align="center" style={{ lineHeight: 0 }}>
      {content}
    </Group>
  ) : (
    <Stack gap={2} align="center" style={{ lineHeight: 0 }}>
      {content}
    </Stack>
  );
}
