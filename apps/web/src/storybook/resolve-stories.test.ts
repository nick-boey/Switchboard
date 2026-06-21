import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStories } from './resolve-stories';

/**
 * The production-exclusion regression guard (design "Regression guard is the point"): one tested
 * source of truth, consumed by both `.storybook` configs and these tests. `production` must never
 * surface a `src/prototypes/**` path; `prototypes` must surface only those.
 */
const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..'); // apps/web/src
const underPrototypes = (p: string) => p.replaceAll('\\', '/').includes('/prototypes/');

describe('resolveStories', () => {
  it('production excludes every src/prototypes/** path', () => {
    const stories = resolveStories(srcDir, 'production');
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.filter(underPrototypes)).toEqual([]);
  });

  it('prototypes returns only src/prototypes/** paths', () => {
    const stories = resolveStories(srcDir, 'prototypes');
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.every(underPrototypes)).toBe(true);
  });
});
