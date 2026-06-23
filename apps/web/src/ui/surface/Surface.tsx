import { Box, Text, type BoxProps } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Flat surface primitives (ui-prototypes-mvp Decision 1). A **raised card** — outlined, with the
 * four-corner-screw motif and an optional inset section title — and a **pressed well** — recessed,
 * no screws, no title — for lists and read-outs. Both read the scheme-aware `--sb-*` CSS variables,
 * so dark mode flows through Mantine's colour scheme with no per-component scheme function.
 */
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
const ALL_CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

function Screws({ corners }: { corners: Corner[] }) {
  const inset = 6;
  const pos: Record<Corner, CSSProperties> = {
    tl: { top: inset, left: inset },
    tr: { top: inset, right: inset },
    bl: { bottom: inset, left: inset },
    br: { bottom: inset, right: inset },
  };
  return (
    <>
      {corners.map((c) => (
        <span
          key={c}
          data-sb-screw=""
          aria-hidden
          style={{
            position: 'absolute',
            width: 6,
            height: 6,
            borderRadius: '50%',
            border: '1px solid var(--sb-screw)',
            ...pos[c],
          }}
        />
      ))}
    </>
  );
}

export interface CardProps extends BoxProps {
  children?: ReactNode;
  /** Optional inset (engraved) section title — belongs to cards only. */
  title?: string;
  /** Show the corner-screw motif (default true). */
  screws?: boolean;
  /** Which corners get screws (default all four) — collapse some when cards are stacked. */
  corners?: Corner[];
  'data-testid'?: string;
}

/** A raised card: outlined flat surface with corner screws and an optional inset title. */
export function Card({
  title,
  screws = true,
  corners = ALL_CORNERS,
  children,
  p = 'lg',
  style,
  ...rest
}: CardProps) {
  const showScrews = screws && corners.length > 0;
  return (
    <Box
      data-sb-surface="card"
      p={p}
      style={{
        position: 'relative',
        background: 'var(--sb-surface)',
        border: '1px solid var(--sb-border)',
        borderRadius: 'var(--sb-panel-radius)',
        color: 'var(--sb-text)',
        ...style,
      }}
      {...rest}
    >
      {showScrews && <Screws corners={corners} />}
      {title && (
        <Text
          component="div"
          data-sb-title=""
          tt="uppercase"
          fz="xs"
          fw={700}
          mb="sm"
          style={{ letterSpacing: '0.08em', opacity: 0.75 }}
        >
          {title}
        </Text>
      )}
      {children}
    </Box>
  );
}

export interface WellProps extends BoxProps {
  children?: ReactNode;
  'data-testid'?: string;
}

/** A pressed well: recessed surface with no screws and no inset title, for lists / read-outs. */
export function Well({ children, p = 'md', style, ...rest }: WellProps) {
  return (
    <Box
      data-sb-surface="well"
      p={p}
      style={{
        background: 'var(--sb-well)',
        border: '1px solid var(--sb-divider)',
        borderRadius: 'var(--sb-panel-radius)',
        color: 'var(--sb-text)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
