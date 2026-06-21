import { describe, it, expect } from 'vitest';
import { derivePrototypeTitle, PROTOTYPE_TAGS } from './derive-prototype-title';

/**
 * Pure title/tag derivation (design "Location-based indexer via a pure function"). Unit-tested
 * independent of Storybook's indexer API; the thin indexer adapter is covered by the build smoke.
 */
describe('derivePrototypeTitle', () => {
  it('maps src/prototypes/<change>/<name>.stories.tsx → Prototypes/<change>/<name>', () => {
    expect(derivePrototypeTitle('/abs/apps/web/src/prototypes/_sample/Sample.stories.tsx')).toBe(
      'Prototypes/_sample/Sample',
    );
    expect(derivePrototypeTitle('src/prototypes/repo-clone/CloneList.stories.ts')).toBe(
      'Prototypes/repo-clone/CloneList',
    );
  });

  it('preserves intermediate directories for deeper nesting', () => {
    expect(derivePrototypeTitle('src/prototypes/repo-clone/panels/Header.stories.tsx')).toBe(
      'Prototypes/repo-clone/panels/Header',
    );
  });

  it('derives one location-based title regardless of the file’s named exports', () => {
    // The indexer reuses this single title for every named export in the file, nesting each
    // export beneath it (verified end-to-end by the build smoke). The derivation is path-only.
    expect(derivePrototypeTitle('src/prototypes/worktrees/Board.stories.tsx')).toBe(
      'Prototypes/worktrees/Board',
    );
  });

  it('normalises Windows-style separators', () => {
    expect(
      derivePrototypeTitle('C:\\repo\\apps\\web\\src\\prototypes\\_sample\\Sample.stories.tsx'),
    ).toBe('Prototypes/_sample/Sample');
  });

  it('exposes the shared quarantine tags', () => {
    expect(PROTOTYPE_TAGS).toEqual(['prototype', '!autodocs']);
  });
});
