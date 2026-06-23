import { Text, type TextProps } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * Typography helpers (ui-prototypes-mvp "Typography system"). The geometric heading/body ramp and
 * the monospace family live in the theme; these primitives apply them semantically — `Mono` for
 * machine identifiers, `FieldLabel` for the uppercase tracked field micro-label (the flat
 * replacement for the embossed nameplate), and `SectionTitle` for group headers.
 */
export interface TypeProps extends TextProps {
  children?: ReactNode;
  'data-testid'?: string;
}

/** Machine identifiers — branch names, commit hashes, commands, paths — in the monospace family. */
export function Mono({ children, ...rest }: TypeProps) {
  return (
    <Text component="span" ff="monospace" data-sb-mono="" {...rest}>
      {children}
    </Text>
  );
}

/** Uppercase, letter-tracked micro-label for section / field labels. */
export function FieldLabel({ children, ...rest }: TypeProps) {
  return (
    <Text
      component="div"
      data-sb-field-label=""
      tt="uppercase"
      fz="xs"
      fw={700}
      c="dimmed"
      style={{ letterSpacing: '0.14em' }}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** A plain-text section / group header (used outside raised cards). */
export function SectionTitle({ children, ...rest }: TypeProps) {
  return (
    <Text
      component="div"
      data-sb-section-title=""
      tt="uppercase"
      fz="sm"
      fw={700}
      c="dimmed"
      style={{ letterSpacing: '0.14em' }}
      {...rest}
    >
      {children}
    </Text>
  );
}
