import { describe, it, expect } from 'vitest';
import { globSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import webConfig from '../../vitest.config';

// Guard for the narrowed prototype quarantine (task 1.2). Narrowing the Vitest exclude so shared
// root helpers (like define-prototype-meta.ts and this very file) ARE collected carries one real
// risk: a co-located test inside a per-change sketch folder must STILL be quarantined.
//
// This resolves the unit-test include against the real filesystem with and without the package's
// actual exclude patterns (imported from vitest.config.ts, so the guard cannot drift from the
// config it protects) and asserts that the sketch-folder poison pill is removed by the exclude
// while a src/prototypes root module test survives. (Line comments only: the narrowed glob pattern
// would close a block comment early.)
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const exclude = (webConfig as { test?: { exclude?: string[] } }).test?.exclude ?? [];
const UNIT_INCLUDE = 'src/**/*.test.{ts,tsx}';

const SKETCH_TEST = 'src/prototypes/_quarantine-guard/leaked.test.tsx';
const ROOT_HELPER_TEST = 'src/prototypes/quarantine-guard.test.ts';

function resolveUnitTests(applyExclude: boolean): string[] {
  return globSync(UNIT_INCLUDE, {
    cwd: packageRoot,
    exclude: applyExclude ? exclude : undefined,
  }).map((p) => p.replaceAll('\\', '/'));
}

describe('prototype quarantine guard', () => {
  it('the sketch-folder test exists and matches the unit include (without exclude)', () => {
    const all = resolveUnitTests(false);
    expect(all).toContain(SKETCH_TEST);
    expect(all).toContain(ROOT_HELPER_TEST);
  });

  it('the narrowed exclude quarantines sketch-folder tests but keeps root-level module tests', () => {
    const collected = resolveUnitTests(true);
    expect(collected).not.toContain(SKETCH_TEST);
    expect(collected).toContain(ROOT_HELPER_TEST);
  });
});
