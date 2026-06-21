import { UnstyledButton, useMantineTheme, Tooltip } from '@mantine/core';
import type { SwitchboardTokens } from '../theme/theme';

export interface JackButtonProps {
  /** Accessible label for the jack (also shown as a tooltip). */
  label: string;
  /** Lit (connected) state — the brass ring glows and the bore shows a patch. */
  active?: boolean;
  onClick?: () => void;
  'data-testid'?: string;
}

/**
 * Plug/jack socket primitive (design Decision 7). A circular brass-ringed socket with a dark
 * bore — the signature switchboard motif — rendered as an accessible button. `active` lights
 * the ring to read as a patched/connected line.
 */
export function JackButton({
  label,
  active = false,
  onClick,
  'data-testid': testId,
}: JackButtonProps) {
  const theme = useMantineTheme();
  const tokens = theme.other as SwitchboardTokens;
  return (
    <Tooltip label={label} withArrow>
      <UnstyledButton
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        data-testid={testId}
        style={{
          width: tokens.jackDiameter,
          height: tokens.jackDiameter,
          borderRadius: '50%',
          background: `radial-gradient(circle at 50% 38%, ${tokens.jackBore} 0 34%, ${tokens.jackRing} 36% 64%, ${theme.colors.brass[7]} 66% 100%)`,
          boxShadow: active
            ? `0 0 0 2px ${theme.colors.signal[5]}, ${tokens.embossSurface}`
            : tokens.embossSurface,
          cursor: 'pointer',
          display: 'inline-block',
        }}
      />
    </Tooltip>
  );
}
