import { describe, it, expect } from 'vitest';
import { resolvedScheme, schemeTest, SCHEME_TEST_PARAM, VIEWPORTS } from './scheme-test';

/**
 * Pure-logic unit cover for the test-runner scheme/viewport helpers (task 1.2). The browser-side
 * behaviour (emulation actually driving a rendered story) is proven by `scheme-test.stories.tsx`'s
 * play function under the Storybook test-runner; here we only pin the parameter shape and the
 * document read so a regression in the contract fails fast in the node suite.
 */
describe('scheme-test helpers', () => {
  it('schemeTest wraps params under the test-runner parameter key', () => {
    expect(schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.phone })).toEqual({
      [SCHEME_TEST_PARAM]: { colorScheme: 'dark', viewport: 390 },
    });
  });

  it('resolvedScheme reads the Mantine document attribute, defaulting to light', () => {
    const make = (value: string | null): Document =>
      ({ documentElement: { getAttribute: () => value } }) as unknown as Document;
    expect(resolvedScheme(make('dark'))).toBe('dark');
    expect(resolvedScheme(make('light'))).toBe('light');
    expect(resolvedScheme(make(null))).toBe('light');
  });
});
