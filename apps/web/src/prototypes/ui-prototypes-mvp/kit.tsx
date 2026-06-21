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
import type { ReactNode } from 'react';
import { JackButton } from '../../components/JackButton';
import type { SwitchboardTokens } from '../../theme/theme';

/**
 * Proposed DARK-panel finish (gate decision: "true dark panels"). The production `EmbossedPanel`
 * forces cream bakelite in every scheme; here we sketch the second finish a dark mode would add —
 * a charcoal bakelite surface with re-tuned emboss and light text. Kept in the prototype so the
 * gate can see it; turning this into a real `EmbossedPanel` dark variant + theme tokens is
 * implementation work for the feature changes, not this skill.
 */
const DARK_SURFACE = '#2a241d';
const DARK_EMBOSS =
  'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -2px 4px rgba(0,0,0,0.55), 0 3px 8px rgba(0,0,0,0.6)';
const DARK_INSET = 'inset 0 2px 6px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.07)';

export interface PanelProps extends BoxProps {
  children?: ReactNode;
  /** Render a pressed (inset) well instead of a raised surface. */
  pressed?: boolean;
  'data-testid'?: string;
}

/**
 * The prototype's scheme-adaptive embossed panel: cream bakelite in light, charcoal bakelite in
 * dark. Mirrors the production `EmbossedPanel` API (`pressed`, `p`, Box props) so the screens read
 * like real code, but adds the dark finish the gate asked for. The screens build every region from
 * this.
 */
export function Panel({ children, pressed = false, p = 'lg', style, ...rest }: PanelProps) {
  const theme = useMantineTheme();
  const tokens = theme.other as SwitchboardTokens;
  const dark = useComputedColorScheme('light') === 'dark';
  return (
    <Box
      p={p}
      style={{
        borderRadius: theme.radius.md,
        background: dark ? DARK_SURFACE : theme.colors.bakelite[1],
        boxShadow: pressed
          ? dark
            ? DARK_INSET
            : tokens.embossInset
          : dark
            ? DARK_EMBOSS
            : tokens.embossSurface,
        color: dark ? theme.colors.bakelite[1] : theme.black,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}

/**
 * Shared sketch components for the `ui-prototypes-mvp` prototypes. These are NOT production
 * primitives — they are candidate '50s-switchboard parts (an indicator lamp, an engraved
 * nameplate, a device frame) that the gallery and the three flow screens reuse so the metaphor
 * stays consistent across sketches. Promotion of any of these into `src/components/` is
 * implementation work owned by the feature changes, not this skill.
 *
 * This is a plain `.tsx` (not `*.stories.tsx`), so the workbench indexer ignores it and it never
 * appears in the sidebar; it is also excluded from the unit run with the rest of the folder.
 */

export type LampColor = 'signal' | 'patina' | 'brass';

/**
 * A domed glass panel-lamp. `lit` makes it glow (line busy / connected / error, depending on
 * `color`); unlit reads as a dark, dead bulb. The signature "is something happening" indicator.
 */
export function IndicatorLamp({
  color = 'signal',
  lit = false,
  size = 14,
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
        background: lit
          ? `radial-gradient(circle at 50% 32%, ${hue[1]} 0 26%, ${hue[4]} 56%, ${hue[7]} 100%)`
          : `radial-gradient(circle at 50% 32%, ${hue[8]} 0 40%, ${hue[9]} 100%)`,
        boxShadow: lit
          ? `0 0 ${size * 0.55}px ${size * 0.2}px ${hue[4]}, inset 0 1px 1px rgba(255,255,255,0.55)`
          : 'inset 0 1px 2px rgba(0,0,0,0.55)',
        border: '1px solid rgba(60,45,20,0.45)',
      }}
    />
  );
}

/**
 * An engraved brass nameplate — recessed strip, uppercase tracked type. Used for field labels and
 * section captions so headings read as machined panel engraving rather than web text.
 */
export function EmbossedLabel({ children, ...rest }: { children: ReactNode } & BoxProps) {
  const theme = useMantineTheme();
  const tokens = theme.other as SwitchboardTokens;
  const dark = useComputedColorScheme('light') === 'dark';
  return (
    <Box
      px={10}
      py={3}
      style={{
        display: 'inline-block',
        // Light: a bright brass plate with dark engraving. Dark: letters engraved into the panel
        // and filled with brass — the plate recedes so it reads on the charcoal finish.
        background: dark ? 'rgba(0,0,0,0.28)' : theme.colors.brass[3],
        borderRadius: theme.radius.xs,
        boxShadow: dark ? DARK_INSET : tokens.embossInset,
        color: dark ? theme.colors.brass[4] : theme.colors.brass[9],
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        fontSize: '0.68rem',
        fontWeight: 700,
        lineHeight: 1.5,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}

/**
 * Frames a screen sketch as a device so mobile and desktop variants read at a glance. `width`
 * sets the viewport (e.g. 390 for a phone, 960 for desktop); the ground adapts to the colour
 * scheme so the bakelite panels sit on an operator-cabinet surface.
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
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        background: 'var(--mantine-color-body)',
        boxShadow: '0 12px 30px rgba(20,15,5,0.45), inset 0 0 0 1px rgba(60,45,20,0.25)',
        border: `2px solid ${theme.colors.brass[7]}`,
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
 * The in-screen app chrome shared by all three flow screens: a patina brand bar (jack + tracked
 * wordmark + an optional right-hand status slot) over a body on the room-coloured ground. The body
 * grows with content (no internal scroll) so a static sketch shows the whole screen at once.
 */
export function AppFrame({
  title = 'Switchboard',
  status,
  toast,
  children,
}: {
  title?: string;
  status?: ReactNode;
  /** A transient overlay anchored to the bottom of the frame (e.g. the session-handoff toast). */
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
          <Box style={{ transform: 'scale(0.7)', transformOrigin: 'left center' }}>
            <JackButton label="Operator line" active />
          </Box>
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
 * A transient snackbar — used for the session-handoff instruction (plan Decision 7): after a
 * session launches, tell the operator to drive the conversation from the official Claude mobile
 * app. A left lamp in `tone`, a title, body copy, and a dismiss. Rendered via AppFrame's `toast`.
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
    <Panel p="sm" style={{ borderLeft: `4px solid ${theme.colors[tone][6]}` }}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Box mt={3}>
          <IndicatorLamp color={tone} lit size={14} label={title} />
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
 * lamp, the single-writer lock that gates further mutating actions while one is in flight.
 */
export function OperationLedger({ ops, locked = false }: { ops: Operation[]; locked?: boolean }) {
  return (
    <Panel>
      <Group justify="space-between" align="center" mb="sm">
        <EmbossedLabel>Operation ledger</EmbossedLabel>
        {locked && (
          <Group gap={6} align="center">
            <IndicatorLamp color="signal" lit size={11} label="line busy" />
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
                style={{
                  borderTop: i === 0 ? undefined : '1px solid rgba(120,90,40,0.18)',
                }}
              >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Box mt={3}>
                    <IndicatorLamp color={lamp.color} lit={lamp.lit} size={13} label={op.status} />
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
