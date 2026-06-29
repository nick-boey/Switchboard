import { useState } from 'react';
import { Box, useComputedColorScheme, useMantineTheme } from '@mantine/core';

/**
 * The "open in Claude web" deep-link affordance (session-web-link, promoted from the
 * `link-claude-code-online` prototype). An anchor styled like the catalogue `IconButton` resting
 * state in the patina accent (the live-session colour), opening `https://claude.ai/code/<id>` in a
 * new tab. The server resolves the bridge id best-effort and the worktrees hub renders this ONLY for
 * a live, resolved session — so this component assumes a known bridge id and just composes the URL
 * (the server stays agnostic to claude.ai's URL shapes, plan Decision 8).
 */

/** An "open in new tab" glyph, drawn in the same 20×20 stroked style as the worktrees-hub glyphs. */
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

export interface ClaudeWebLinkProps {
  /** The resolved cloud bridge session id (`session_…`); the URL is composed client-side. */
  bridgeSessionId: string;
  /** Accessible name for the link. */
  label?: string;
  /** Square edge length in px. */
  size?: number;
  'data-testid'?: string;
}

export function ClaudeWebLink({
  bridgeSessionId,
  label = 'Open in Claude web',
  size = 30,
  'data-testid': testId,
}: ClaudeWebLinkProps) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const [hover, setHover] = useState(false);
  const accent = theme.colors.patina[dark ? 4 : 6];
  const iconColor = hover ? '#fff' : accent;
  const background = hover ? accent : dark ? 'rgba(120,170,150,0.18)' : 'rgba(70,120,95,0.10)';
  return (
    <Box
      component="a"
      href={`https://claude.ai/code/${bridgeSessionId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      data-testid={testId}
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
        border: `1px solid ${accent}`,
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
