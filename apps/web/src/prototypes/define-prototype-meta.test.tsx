import { describe, it, expect } from 'vitest';
import { definePrototypeMeta } from './define-prototype-meta';
import { PROTOTYPE_TAGS } from '../storybook/derive-prototype-title';

/**
 * The authoring helper (design Decision: "Helper … tags only"). It pre-fills the quarantine tags
 * from the single shared constant and is spread into a story's `meta` literal. It sets no title —
 * the indexer derives the title from file location.
 */
function Demo() {
  return null;
}

describe('definePrototypeMeta', () => {
  it('carries the quarantine tags, preserves caller props, and sets no title', () => {
    const parameters = { layout: 'centered' };
    const meta = { ...definePrototypeMeta({ component: Demo, parameters }) };

    expect(meta.tags).toEqual([...PROTOTYPE_TAGS]);
    expect(meta.component).toBe(Demo);
    expect(meta.parameters).toBe(parameters);
    expect('title' in meta).toBe(false);
  });

  it('rejects a caller-supplied title at the type level (the indexer owns titles)', () => {
    // @ts-expect-error — definePrototypeMeta forbids a hand-written `title`; the location-based
    // indexer derives it. This guard is enforced by `tsc` (just typecheck), not at runtime.
    definePrototypeMeta({ component: Demo, title: 'Should not compile' });
  });
});
