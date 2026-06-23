import { Box, Group, Stack, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * Status indicator lamps (ui-prototypes-mvp Decision 4) — a bezelled bulb capped by a small symbol
 * naming its column. **Display-only** in the MVP: they communicate status and expose no interactive
 * action (rendered as a status image, never a button). PR `open`/`merged` draw from the cobalt /
 * violet theme tokens (`--sb-pr-*`); the other tones reuse Patina / Brass / Signal — no ad-hoc hex.
 */
export type LampTone = 'neutral' | 'yellow' | 'green' | 'red' | 'blue' | 'purple';

export type GitStatus = 'up-to-date' | 'behind' | 'ahead' | 'diverged';
export type PrStatus =
  | 'none'
  | 'open'
  | 'ready'
  | 'checks-failing'
  | 'conflicts'
  | 'conflicts-failing'
  | 'merged';

export type IndicatorKind = 'git' | 'pr';

/** The bezelled bulb, coloured by `tone`. `neutral` reads as an unlit socket. Display-only. */
export function StatusLight({
  tone = 'neutral',
  size = 10,
  label,
  'data-testid': testId,
}: {
  tone?: LampTone;
  size?: number;
  label?: string;
  'data-testid'?: string;
}) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const hue: Record<Exclude<LampTone, 'neutral'>, string> = {
    yellow: theme.colors.brass[dark ? 4 : 6],
    green: theme.colors.patina[dark ? 4 : 6],
    red: theme.colors.signal[dark ? 4 : 6],
    blue: 'var(--sb-pr-open)',
    purple: 'var(--sb-pr-merged)',
  };
  const off = tone === 'neutral';
  const fill = off ? 'var(--sb-subtle)' : hue[tone];
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-sb-lamp=""
      data-tone={tone}
      data-testid={testId}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1.5px solid var(--sb-screw)',
        background: fill,
        boxShadow: off ? 'none' : `0 0 ${Math.round(size * 0.5)}px ${fill}`,
        display: 'inline-block',
        flex: 'none',
      }}
    />
  );
}

/** A monochrome glyph captioning an indicator column (renders in `currentColor`). */
export function IndicatorSymbol({ kind, size = 12 }: { kind: IndicatorKind; size?: number }) {
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

/** A {@link StatusLight} captioned by its column symbol — the composed git/PR indicator. */
export function IndicatorLight({
  kind,
  tone = 'neutral',
  size = 10,
  symbolSize = 12,
  inline = false,
  label,
  'data-testid': testId,
}: {
  kind?: IndicatorKind;
  tone?: LampTone;
  size?: number;
  symbolSize?: number;
  inline?: boolean;
  label?: string;
  'data-testid'?: string;
}) {
  const content: ReactNode = (
    <>
      {kind && (
        <Box c="dimmed" style={{ lineHeight: 0 }}>
          <IndicatorSymbol kind={kind} size={symbolSize} />
        </Box>
      )}
      <StatusLight tone={tone} size={size} label={label} data-testid={testId} />
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

// --- Git / PR lamps: the status → tone + accessible label mappings (single source) -----------
const GIT_TONE: Record<GitStatus, LampTone> = {
  'up-to-date': 'neutral',
  behind: 'yellow',
  ahead: 'green',
  diverged: 'red',
};
const GIT_LABEL: Record<GitStatus, string> = {
  'up-to-date': 'Git: up to date with remote',
  behind: 'Git: behind remote',
  ahead: 'Git: ahead of remote',
  diverged: 'Git: diverged from remote',
};
const PR_TONE: Record<PrStatus, LampTone> = {
  none: 'neutral',
  open: 'blue',
  ready: 'green',
  'checks-failing': 'red',
  conflicts: 'yellow',
  'conflicts-failing': 'red',
  merged: 'purple',
};
const PR_LABEL: Record<PrStatus, string> = {
  none: 'PR: none open',
  open: 'PR: open',
  ready: 'PR: ready to merge',
  'checks-failing': 'PR: checks failing',
  conflicts: 'PR: merge conflicts',
  'conflicts-failing': 'PR: merge conflicts + checks failing',
  merged: 'PR: merged',
};

export interface LampProps {
  inline?: boolean;
  'data-testid'?: string;
}

/** The git-status lamp (display-only). */
export function GitLamp({
  status,
  inline,
  'data-testid': testId,
}: LampProps & { status: GitStatus }) {
  return (
    <IndicatorLight
      kind="git"
      tone={GIT_TONE[status]}
      label={GIT_LABEL[status]}
      inline={inline}
      data-testid={testId}
    />
  );
}

/** The PR-status lamp (display-only). */
export function PrLamp({
  status,
  inline,
  'data-testid': testId,
}: LampProps & { status: PrStatus }) {
  return (
    <IndicatorLight
      kind="pr"
      tone={PR_TONE[status]}
      label={PR_LABEL[status]}
      inline={inline}
      data-testid={testId}
    />
  );
}
