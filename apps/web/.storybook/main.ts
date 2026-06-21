import { globSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const configDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(configDir, '..', 'src');

/**
 * Prototype quarantine (design Decision 7): the production / snapshot / autodocs Storybook
 * excludes `src/prototypes/**`. Storybook 10 does not honour `!` negations in the `stories`
 * array, so the list is computed here and prototype paths are filtered out structurally —
 * they never reach the production build, the snapshot run, autodocs, the published API, or
 * production bundles. Prototype stories are viewable only via the dedicated config added by
 * the `switch-ui-prototype` workflow.
 */
const stories = globSync('**/*.stories.@(ts|tsx)', { cwd: srcDir })
  .filter((relPath) => !relPath.split('/').includes('prototypes'))
  .map((relPath) => join(srcDir, relPath));

const config: StorybookConfig = {
  stories,
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};

export default config;
