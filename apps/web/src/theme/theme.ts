import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';

/**
 * The '50s retro switchboard theme — flat treatment (ui-prototypes-mvp Decision 1).
 *
 * The four palette ramps and the geometric type carry over from the embossed `foundations`
 * theme; the embossed/jack shadow tokens are replaced by a flat surface vocabulary (raised card,
 * pressed well, hairline divider, corner-screw, panel radius) plus two named indicator-status
 * colours (cobalt / violet) the four hardware ramps can't express. All of it folds into one source:
 * Mantine theme data + a `cssVariablesResolver` (Decision 5) so primitives read scheme-aware
 * `--sb-*` CSS variables and dark mode flows through Mantine's colour scheme.
 */

// --- Palette (carried over unchanged) --------------------------------------
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

// Signal red — error / destructive / "line busy".
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

// --- Flat surface vocabulary (graduated from the prototype `flat()` scheme) -------------------
/** Scheme-dependent flat surfaces — only neutrals go scheme-aware; the accent ramps don't. */
export interface FlatSurfaces {
  /** Page background behind the app frame. */
  ground: string;
  /** App body inside the frame. */
  body: string;
  /** Raised card surface. */
  surface: string;
  /** Recessed well surface. */
  well: string;
  /** Card / frame outline. */
  border: string;
  /** Corner-screw outline circle. */
  screw: string;
  /** Drawer rail. */
  rail: string;
  /** Body text. */
  text: string;
  /** Subtle hover / selected wash. */
  subtle: string;
}

const flatLight: FlatSurfaces = {
  ground: '#ececeb',
  body: '#f6f6f4',
  surface: '#ffffff',
  well: '#f2f2f0',
  border: 'rgba(0,0,0,0.14)',
  screw: 'rgba(0,0,0,0.26)',
  rail: '#ececeb',
  text: '#1f1f1f',
  subtle: 'rgba(0,0,0,0.05)',
};

const flatDark: FlatSurfaces = {
  ground: '#101010',
  body: '#181818',
  surface: '#212121',
  well: '#1a1a1a',
  border: 'rgba(255,255,255,0.14)',
  screw: 'rgba(255,255,255,0.30)',
  rail: '#151515',
  text: '#e6e6e6',
  subtle: 'rgba(255,255,255,0.06)',
};

/** A colour that differs between the light and dark schemes. */
export interface SchemePair {
  light: string;
  dark: string;
}

/**
 * Indicator status colours beyond the four hardware ramps (ui-prototypes-mvp BLOCKING fix): cobalt
 * for the PR `open` lamp and violet for the PR `merged` lamp — graduated from the prototype's local
 * `COBALT` / `VIOLET` constants into the theme as the single, scheme-aware source.
 */
const prOpen: SchemePair = { light: '#2f6aa8', dark: '#6ba6e0' };
const prMerged: SchemePair = { light: '#7048c4', dark: '#a78bea' };

/** Radius of a flat card / well (px). */
export const PANEL_RADIUS = 6;
/** Neutral hairline divider that reads on both schemes. */
export const FLAT_DIVIDER = 'rgba(128,128,128,0.25)';

/**
 * Non-Mantine design tokens consumed by the switchboard primitives, under `theme.other` so they
 * are reachable via `useMantineTheme().other` and stay a single source of truth alongside the
 * `--sb-*` CSS variables emitted by `switchboardCssVariablesResolver`.
 */
export interface SwitchboardTokens {
  /** Card / well corner radius (px). */
  panelRadius: number;
  /** Hairline divider colour (scheme-independent). */
  divider: string;
  /** Scheme-aware flat surfaces. */
  surfaces: { light: FlatSurfaces; dark: FlatSurfaces };
  /** Scheme-aware indicator status colours (PR open / merged). */
  indicator: { prOpen: SchemePair; prMerged: SchemePair };
  /** Letter-spacing for the engraved, geometric wordmark. */
  wordmarkTracking: string;
}

export const switchboardTokens: SwitchboardTokens = {
  panelRadius: PANEL_RADIUS,
  divider: FLAT_DIVIDER,
  surfaces: { light: flatLight, dark: flatDark },
  indicator: { prOpen, prMerged },
  wordmarkTracking: '0.28em',
};

// Geometric, mid-century sans stack (Futura-adjacent) with a dependable system fallback.
const geometricStack =
  '"Futura", "Century Gothic", "Avant Garde", "Twentieth Century", "Questrial", system-ui, sans-serif';

export const switchboardTheme = createTheme({
  primaryColor: 'patina',
  primaryShade: { light: 6, dark: 5 },
  colors: { bakelite, patina, brass, signal },
  white: '#ffffff',
  black: '#1f1f1f',
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
    // Flat treatment: no embossed stack. A whisper of depth for overlays only.
    xs: 'none',
    sm: 'none',
    md: '0 2px 8px rgba(0,0,0,0.12)',
    lg: '0 8px 24px rgba(0,0,0,0.16)',
    xl: '0 16px 40px rgba(0,0,0,0.20)',
  },
  other: switchboardTokens,
});

/** Map a scheme's flat surfaces + indicator colours onto the `--sb-*` CSS variable names. */
function surfaceVars(s: FlatSurfaces, prOpenColor: string, prMergedColor: string) {
  return {
    '--sb-ground': s.ground,
    '--sb-body': s.body,
    '--sb-surface': s.surface,
    '--sb-well': s.well,
    '--sb-border': s.border,
    '--sb-screw': s.screw,
    '--sb-rail': s.rail,
    '--sb-text': s.text,
    '--sb-subtle': s.subtle,
    '--sb-pr-open': prOpenColor,
    '--sb-pr-merged': prMergedColor,
  };
}

/**
 * Folds the flat token set into Mantine CSS variables (Decision 5). Passed to `MantineProvider`
 * so every `--sb-*` token resolves per scheme — primitives read `var(--sb-surface)` etc. and dark
 * mode flows through Mantine's colour scheme without any per-primitive runtime scheme function.
 */
export const switchboardCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--sb-panel-radius': `${PANEL_RADIUS}px`,
    '--sb-divider': FLAT_DIVIDER,
  },
  light: surfaceVars(flatLight, prOpen.light, prMerged.light),
  dark: surfaceVars(flatDark, prOpen.dark, prMerged.dark),
});

export type SwitchboardTheme = typeof switchboardTheme;
