import { describe, it, expect } from 'vitest';
import config from '../../.storybook-prototypes/main';

/**
 * The prototype config wiring (task 6.1): its resolved story list must include the `_sample`
 * prototype and contain ONLY `src/prototypes/**` paths — never a production story. The exclusion
 * direction is covered by `resolve-stories.test.ts`; this pins that the dedicated config is wired
 * to the `prototypes` resolver mode.
 */
describe('prototype Storybook config', () => {
  it('resolves only prototype stories (includes _sample, excludes production)', () => {
    const stories = (config.stories as string[]).map((s) => s.replaceAll('\\', '/'));

    expect(stories.length).toBeGreaterThan(0);
    expect(stories.some((s) => s.endsWith('/prototypes/_sample/Sample.stories.tsx'))).toBe(true);
    expect(stories.every((s) => s.includes('/prototypes/'))).toBe(true);
    expect(stories.some((s) => s.includes('/components/AppShell.stories'))).toBe(false);
  });
});
