import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * The '50s retro switchboard theme (design Decision 7).
 *
 * Tokens only — embossed bakelite surfaces, plug/jack motifs, and geometric type. This is a
 * deliberately small token layer (theme + a couple of primitives); the full visual treatment
 * lands in the later `ui-prototypes-mvp` change. Everything here is plain Mantine theme data
 * so Storybook, the app shell, and future screens consume one source of truth.
 */

// --- Palette ----------------------------------------------------------------
// Bakelite cream — the dominant panel/background tone of mid-century equipment.
const bakelite: MantineColorsTuple = [
  '#fbf6ea',
  '#f3ead4',
  '#e8d8b3',
  '#dcc591',
  '#d2b574',
  '#ccab62',
  '#c9a557',
  '#b19046',
  '#9d7f3c',
  '#886c2e',
];

// Patina teal — the painted steel of an operator's switchboard cabinet. Primary accent.
const patina: MantineColorsTuple = [
  '#e7f6f4',
  '#d3e9e6',
  '#a8d2cd',
  '#7abab2',
  '#54a69c',
  '#3b9a8f',
  '#2c9387',
  '#1d8074',
  '#0c7166',
  '#005e54',
];

// Brass — plug shells, knobs, and engraved labels. Secondary accent.
const brass: MantineColorsTuple = [
  '#fdf6e3',
  '#f6e9c4',
  '#edd28b',
  '#e4ba4d',
  '#dca722',
  '#d59c0d',
  '#d09600',
  '#b87f00',
  '#a37000',
  '#8c5e00',
];

// Signal red — the "line busy" indicator lamp.
const signal: MantineColorsTuple = [
  '#ffeceb',
  '#fdd8d6',
  '#f4afaa',
  '#ec827b',
  '#e55d53',
  '#e1453a',
  '#e0382c',
  '#c72a1f',
  '#b2221a',
  '#9c1712',
];

/**
 * Non-Mantine design tokens consumed by the switchboard primitives. Kept under `theme.other`
 * so they are reachable via `useMantineTheme().other` and remain a single source of truth.
 */
export interface SwitchboardTokens {
  /** Box-shadow stack giving a panel its raised, embossed bakelite edge. */
  embossSurface: string;
  /** Box-shadow stack for a pressed / inset surface (a jack socket). */
  embossInset: string;
  /** Diameter of a plug/jack socket primitive. */
  jackDiameter: string;
  /** Brass ring colour around a jack socket. */
  jackRing: string;
  /** The dark bore at the centre of a jack socket. */
  jackBore: string;
  /** Letter-spacing for the engraved, geometric wordmark. */
  wordmarkTracking: string;
}

export const switchboardTokens: SwitchboardTokens = {
  embossSurface:
    'inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -2px 3px rgba(120,90,40,0.28), 0 2px 4px rgba(60,45,20,0.30)',
  embossInset: 'inset 0 2px 4px rgba(60,45,20,0.45), inset 0 -1px 0 rgba(255,255,255,0.35)',
  jackDiameter: '2.75rem',
  jackRing: brass[5],
  jackBore: '#241c10',
  wordmarkTracking: '0.28em',
};

// Geometric, mid-century sans stack (Futura-adjacent) with a dependable system fallback.
const geometricStack =
  '"Futura", "Century Gothic", "Avant Garde", "Twentieth Century", "Questrial", system-ui, sans-serif';

export const switchboardTheme = createTheme({
  primaryColor: 'patina',
  primaryShade: { light: 6, dark: 5 },
  colors: { bakelite, patina, brass, signal },
  white: '#fbf6ea',
  black: '#241c10',
  defaultRadius: 'sm',
  fontFamily: geometricStack,
  fontFamilyMonospace: '"DM Mono", "IBM Plex Mono", ui-monospace, monospace',
  headings: {
    fontFamily: geometricStack,
    fontWeight: '700',
  },
  radius: {
    xs: '2px',
    sm: '4px',
    md: '8px',
    lg: '14px',
    xl: '22px',
  },
  shadows: {
    // The embossed bakelite stack is the house "panel" shadow.
    xs: switchboardTokens.embossSurface,
    sm: switchboardTokens.embossSurface,
    md: '0 4px 10px rgba(60,45,20,0.28), inset 0 1px 0 rgba(255,255,255,0.6)',
    lg: '0 10px 24px rgba(60,45,20,0.32), inset 0 1px 0 rgba(255,255,255,0.6)',
    xl: '0 18px 40px rgba(60,45,20,0.38), inset 0 1px 0 rgba(255,255,255,0.6)',
  },
  other: switchboardTokens,
});

export type SwitchboardTheme = typeof switchboardTheme;
