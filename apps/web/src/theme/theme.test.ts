import { describe, it, expect } from 'vitest';
import {
  PANEL_RADIUS,
  switchboardCssVariablesResolver,
  switchboardTheme,
  switchboardTokens,
} from './theme';

/**
 * Flat token contract (task 2.1). The four hardware palettes carry over, the flat surface +
 * panel-radius + indicator-status tokens exist and resolve in both schemes, and the embossed token
 * set is gone. Scheme resolution is asserted through the `cssVariablesResolver` (the single token
 * source folds into Mantine CSS variables, design Decision 5), which is node-testable; the rendered
 * computed-style proof lives in the primitive stories' play functions under the test-runner.
 */
/** The resolver ignores its argument; `createTheme` returns a partial, so cast to its param type. */
const resolveVars = () =>
  switchboardCssVariablesResolver(
    switchboardTheme as Parameters<typeof switchboardCssVariablesResolver>[0],
  );

describe('switchboard flat theme tokens', () => {
  it('retains the four palettes as 10-step ramps with patina primary', () => {
    for (const name of ['bakelite', 'patina', 'brass', 'signal'] as const) {
      expect(switchboardTheme.colors?.[name]).toHaveLength(10);
    }
    expect(switchboardTheme.primaryColor).toBe('patina');
  });

  it('drops the embossed token set', () => {
    const other = switchboardTokens as unknown as Record<string, unknown>;
    for (const gone of ['embossSurface', 'embossInset', 'jackDiameter', 'jackRing', 'jackBore']) {
      expect(other[gone]).toBeUndefined();
    }
  });

  it('exposes the flat surface + panel-radius tokens', () => {
    expect(switchboardTokens.panelRadius).toBe(PANEL_RADIUS);
    expect(switchboardTokens.divider).toBeTruthy();
    expect(switchboardTokens.surfaces.light.surface).toBeTruthy();
    expect(switchboardTokens.surfaces.dark.surface).toBeTruthy();
  });

  it('resolves the flat surface tokens in both schemes, with distinct values', () => {
    const vars = resolveVars();
    for (const key of [
      '--sb-ground',
      '--sb-surface',
      '--sb-well',
      '--sb-text',
      '--sb-screw',
    ] as const) {
      expect(vars.light[key]).toBeTruthy();
      expect(vars.dark[key]).toBeTruthy();
      expect(vars.light[key]).not.toBe(vars.dark[key]);
    }
    expect(vars.variables['--sb-panel-radius']).toBe(`${PANEL_RADIUS}px`);
    expect(vars.variables['--sb-divider']).toBeTruthy();
  });

  it('exposes cobalt/violet indicator status tokens, resolving per scheme', () => {
    expect(switchboardTokens.indicator.prOpen.light).toBeTruthy();
    expect(switchboardTokens.indicator.prMerged.dark).toBeTruthy();
    const vars = resolveVars();
    expect(vars.light['--sb-pr-open']).not.toBe(vars.dark['--sb-pr-open']);
    expect(vars.light['--sb-pr-merged']).not.toBe(vars.dark['--sb-pr-merged']);
  });
});
