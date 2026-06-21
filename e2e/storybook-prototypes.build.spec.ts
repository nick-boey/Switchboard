import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Storybook build smoke (tasks 7.1–7.2). Runs the real Storybook builds and inspects the produced
 * `index.json` — the strongest regression guard for the quarantine + indexer:
 *
 * - the prototype build indexes `_sample` under its location-derived `Prototypes/_sample/Sample`
 *   title with the `prototype` quarantine tag, a hand-titled fixture is re-titled from its file
 *   location (the indexer overrides hand-written titles), and the `!autodocs` tag takes effect
 *   (no autodocs/docs entry is generated);
 * - the production build indexes NONE of `src/prototypes/**`.
 *
 * Storybook builds are slow, so this lives in the e2e lane (which already builds) rather than the
 * unit run, and each test gets a generous timeout.
 */
const webDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web');

interface IndexEntry {
  type: 'story' | 'docs';
  title: string;
  importPath: string;
  tags?: string[];
}

function buildAndReadIndex(configArgs: string[]): IndexEntry[] {
  const outDir = mkdtempSync(join(tmpdir(), 'sb-smoke-'));
  execFileSync('pnpm', ['exec', 'storybook', 'build', ...configArgs, '-o', outDir, '--quiet'], {
    cwd: webDir,
    stdio: 'pipe',
  });
  const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as {
    entries: Record<string, IndexEntry>;
  };
  return Object.values(index.entries);
}

test.describe('Storybook build smoke', () => {
  test('prototype build: location-derived titles, quarantine tag, no autodocs', () => {
    test.setTimeout(120_000);
    const entries = buildAndReadIndex(['-c', '.storybook-prototypes']);

    const sample = entries.find((e) => e.title === 'Prototypes/_sample/Sample');
    expect(
      sample,
      'the _sample prototype is indexed under its location-derived title',
    ).toBeTruthy();
    expect(sample?.tags).toContain('prototype');

    // The hand-titled fixture is re-titled from its location — the indexer overrides the
    // hand-written `Totally/Different/HandWritten`.
    expect(entries.some((e) => e.title === 'Prototypes/_smoke-fixture/HandTitled')).toBe(true);
    expect(entries.some((e) => e.title === 'Totally/Different/HandWritten')).toBe(false);

    // `!autodocs` takes effect: prototypes generate no autodocs/docs entry.
    expect(entries.some((e) => e.type === 'docs')).toBe(false);
    expect(sample?.tags).not.toContain('autodocs');
  });

  test('production build: every prototype is excluded', () => {
    test.setTimeout(120_000);
    const entries = buildAndReadIndex([]);

    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.filter((e) => e.importPath.replaceAll('\\', '/').includes('/prototypes/')),
    ).toEqual([]);
  });
});
