import { UnstyledButton, useMantineTheme, Tooltip } from '@mantine/core';

export interface JackButtonProps {
  /** Accessible label for the jack (also shown as a tooltip). */
  label: string;
  /** Lit (connected) state — the brass ring glows and the bore shows a patch. */
  active?: boolean;
  onClick?: () => void;
  'data-testid'?: string;
}

/**
 * Bridge: the brass jack motif on flat surfaces. Superseded by the `src/ui` button / icon-button
 * primitives (task 6.2); kept compiling only until its consumers (the app shell) move over.
 */
export function JackButton({
  label,
  active = false,
  onClick,
  'data-testid': testId,
}: JackButtonProps) {
  const theme = useMantineTheme();
  return (
    <Tooltip label={label} withArrow>
      <UnstyledButton
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        data-testid={testId}
        style={{
          width: '2.75rem',
          height: '2.75rem',
          borderRadius: '50%',
          background: `radial-gradient(circle at 50% 38%, ${theme.black} 0 34%, ${theme.colors.brass[5]} 36% 64%, ${theme.colors.brass[7]} 66% 100%)`,
          boxShadow: active ? `0 0 0 2px ${theme.colors.signal[5]}` : 'none',
          cursor: 'pointer',
          display: 'inline-block',
        }}
      />
    </Tooltip>
  );
}
