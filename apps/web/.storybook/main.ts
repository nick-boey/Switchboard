import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import { resolveStories } from '../src/storybook/resolve-stories';

const configDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(configDir, '..', 'src');

/**
 * Prototype quarantine (design Decision 7): the production / snapshot / autodocs Storybook
 * excludes `src/prototypes/**`. Storybook 10 does not honour `!` negations in the `stories`
 * array, so the list is computed via the shared `resolveStories` helper and prototype paths are
 * dropped structurally — they never reach the production build, the snapshot run, autodocs, the
 * published API, or production bundles. Prototype stories are viewable only via the dedicated
 * `.storybook-prototypes` config (the `storybook:prototypes` workbench).
 */
const stories = resolveStories(srcDir, 'production');

const config: StorybookConfig = {
  stories,
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};

export default config;
