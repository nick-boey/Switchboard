/**
 * Colour-scheme + viewport emulation contract for the Storybook test-runner (tasks 1.1/1.2).
 *
 * A production story opts in by spreading `schemeTest({ colorScheme, viewport })` into its
 * `parameters`. The test-runner hook (`.storybook/test-runner.ts`) reads that parameter and drives
 * Playwright's `emulateMedia({ colorScheme })` + `setViewportSize(...)` before the story renders,
 * while the global preview renders scheme-tested stories under `colorScheme="auto"` so the emulated
 * `prefers-color-scheme` flows through Mantine (the prototype-workbench pattern). The story's `play`
 * function then reads the resolved scheme with `resolvedScheme()`.
 */
export type SchemeName = 'light' | 'dark';

/** House responsive widths — the drawer↔rail breakpoint (task 8.6) reuses these. */
export const VIEWPORTS = { phone: 390, desktop: 1120 } as const;

/** Storybook parameter key carrying a story's per-render emulation request. */
export const SCHEME_TEST_PARAM = 'schemeTest';

export interface SchemeTestParams {
  /** Emulated OS `prefers-color-scheme` for this story. */
  colorScheme?: SchemeName;
  /** Emulated viewport width in px (height fixed at 900). */
  viewport?: number;
}

/** Spread into a story's `parameters` to drive scheme/viewport emulation under the test-runner. */
export function schemeTest(params: SchemeTestParams): { schemeTest: SchemeTestParams } {
  return { schemeTest: params };
}

/** Read the scheme Mantine resolved onto the document — call inside a `play` function. */
export function resolvedScheme(doc: Document = document): SchemeName {
  return doc.documentElement.getAttribute('data-mantine-color-scheme') === 'dark'
    ? 'dark'
    : 'light';
}
