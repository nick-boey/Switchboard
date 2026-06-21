import { Box, useMantineTheme, type BoxProps } from '@mantine/core';
import type { ReactNode } from 'react';
import type { SwitchboardTokens } from '../theme/theme';

export interface EmbossedPanelProps extends BoxProps {
  children?: ReactNode;
  /** Render a pressed (inset) surface instead of a raised one. */
  pressed?: boolean;
  'data-testid'?: string;
}

/**
 * Embossed bakelite surface primitive (design Decision 7). A raised — or, with `inset`, a
 * pressed — panel built from the `embossSurface` / `embossInset` shadow tokens on a bakelite
 * ground. The dominant building block of the '50s switchboard look.
 */
export function EmbossedPanel({
  children,
  pressed = false,
  p = 'lg',
  ...rest
}: EmbossedPanelProps) {
  const theme = useMantineTheme();
  const tokens = theme.other as SwitchboardTokens;
  return (
    <Box
      p={p}
      bg="bakelite.1"
      style={{
        borderRadius: theme.radius.md,
        boxShadow: pressed ? tokens.embossInset : tokens.embossSurface,
        color: theme.black,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
