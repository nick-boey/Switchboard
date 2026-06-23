import {
  Autocomplete,
  type AutocompleteProps,
  Box,
  Button as MantineButton,
  type ButtonProps as MantineButtonProps,
  Select,
  type SelectProps,
  TextInput,
  type TextInputProps,
  useComputedColorScheme,
  useMantineTheme,
} from '@mantine/core';
import type { MouseEventHandler, ReactNode } from 'react';

/**
 * Action + form controls (ui-prototypes-mvp Decision 1 / spec "Action and form controls"). The
 * custom flat controls (button intents, icon button, segmented toggle) plus thin house wrappers
 * over Mantine's selectors / text input that standardise the size and carry the invalid (error)
 * state. The delete icon button's `lit` (armed / safe-to-delete) state is intentionally deferred to
 * `worktree-management`; only resting + disabled ship here.
 */

// --- Button (four intents) -------------------------------------------------
export type ButtonIntent = 'primary' | 'secondary' | 'destructive' | 'subtle';

const INTENT: Record<ButtonIntent, { variant: string; color?: string }> = {
  primary: { variant: 'filled', color: 'patina' },
  secondary: { variant: 'default' },
  destructive: { variant: 'filled', color: 'signal' },
  subtle: { variant: 'subtle', color: 'gray' },
};

export interface ButtonProps extends MantineButtonProps {
  intent?: ButtonIntent;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  'data-testid'?: string;
}

export function Button({ intent = 'primary', ...rest }: ButtonProps) {
  return <MantineButton {...INTENT[intent]} {...rest} />;
}

// --- Icon button -----------------------------------------------------------
export type AccentColor = 'signal' | 'patina' | 'brass' | 'neutral';

/** rgb triples for the accent washes (kept as constants so the soft alpha washes are cheap). */
const ACCENT_RGB: Record<Exclude<AccentColor, 'neutral'>, string> = {
  signal: '199,42,31',
  patina: '44,147,135',
  brass: '208,150,0',
};

export interface IconButtonProps {
  icon: ReactNode;
  label: string;
  color?: AccentColor;
  size?: number;
  disabled?: boolean;
  onClick?: () => void;
  'data-testid'?: string;
}

/** A slightly-rounded square icon button — a soft wash of its accent. Resting + disabled only. */
export function IconButton({
  icon,
  label,
  color = 'neutral',
  size = 30,
  disabled = false,
  onClick,
  'data-testid': testId,
}: IconButtonProps) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const rgb = color === 'neutral' ? (dark ? '230,230,230' : '40,40,40') : ACCENT_RGB[color];
  const ramp = color === 'neutral' ? null : theme.colors[color];
  const soft = (a: number) => `rgba(${rgb},${a})`;
  const iconColor = ramp?.[dark ? 4 : 7] ?? (dark ? '#d8d8d8' : '#3a3a3a');
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={disabled ? undefined : onClick}
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: soft(dark ? 0.22 : 0.12),
        border: `1px solid ${soft(dark ? 0.5 : 0.38)}`,
        color: iconColor,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {icon}
    </Box>
  );
}

// --- Segmented toggle ------------------------------------------------------
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedToggleProps<T extends string> {
  value: T;
  onChange?: (value: T) => void;
  options: SegmentedOption<T>[];
  fullWidth?: boolean;
  'data-testid'?: string;
}

/** A recessed track with the active segment raised as a pill; disabled options are unselectable. */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  fullWidth = false,
  'data-testid': testId,
}: SegmentedToggleProps<T>) {
  return (
    <Box
      data-testid={testId}
      style={{
        display: 'inline-flex',
        width: fullWidth ? '100%' : undefined,
        gap: 3,
        padding: 3,
        borderRadius: 'var(--sb-panel-radius)',
        background: 'var(--sb-well)',
        border: '1px solid var(--sb-divider)',
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
              borderRadius: 'calc(var(--sb-panel-radius) - 2px)',
              border: `1px solid ${active ? 'var(--sb-border)' : 'transparent'}`,
              background: active ? 'var(--sb-surface)' : 'transparent',
              color: active ? 'var(--sb-text)' : 'var(--mantine-color-dimmed)',
              fontSize: 'var(--mantine-font-size-sm)',
              fontWeight: 400,
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              opacity: opt.disabled ? 0.4 : 1,
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

// --- Selectors + text input (house wrappers over Mantine) ------------------
/** Fixed-list dropdown selector (resting + disabled). */
export function Selector(props: SelectProps) {
  return <Select size="sm" {...props} />;
}

/** Editable autocomplete selector (resting + disabled + invalid via `error`). */
export function AutocompleteSelector(props: AutocompleteProps) {
  return <Autocomplete size="sm" {...props} />;
}

/** Single text input (resting + disabled + invalid via `error`). */
export function TextField(props: TextInputProps) {
  return <TextInput size="sm" {...props} />;
}
