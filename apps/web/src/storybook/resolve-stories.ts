import { globSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Which half of the quarantine boundary a Storybook config wants to render.
 * - `production`: every story EXCEPT `src/prototypes/**` (the production / snapshot / autodocs build).
 * - `prototypes`: ONLY `src/prototypes/**` (the dedicated dev-only prototype workbench).
 */
export type StoryMode = 'production' | 'prototypes';

/**
 * One tested source of truth for the prototype quarantine (design Decision: "Shared modules live
 * under `src/storybook/`"). Both `.storybook` configs and the Vitest regression guard call this so
 * the exclusion guarantee cannot drift. Storybook 10 ignores `!` glob negations in the `stories`
 * array, so the split is computed here from `srcDir` and returned as absolute paths.
 */
export function resolveStories(srcDir: string, mode: StoryMode): string[] {
  const pattern =
    mode === 'prototypes' ? 'prototypes/**/*.stories.@(ts|tsx)' : '**/*.stories.@(ts|tsx)';
  const exclude = mode === 'production' ? ['prototypes/**'] : undefined;
  return globSync(pattern, { cwd: srcDir, exclude }).map((relPath) => join(srcDir, relPath));
}
