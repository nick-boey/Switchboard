import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import type { Indexer } from 'storybook/internal/types';
import { resolveStories } from '../src/storybook/resolve-stories';
import { PROTOTYPE_TAGS, derivePrototypeTitle } from '../src/storybook/derive-prototype-title';

const configDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(configDir, '..', 'src');

/**
 * Dedicated, dev-only prototype workbench (design Decision: "Two configs, not an env toggle").
 * It globs ONLY the quarantined prototypes via the shared resolver, so production can never include
 * a prototype regardless of environment. A custom indexer derives Prototypes/<change>/<name> titles
 * and the quarantine tags from each story's file location, delegating CSF parsing to Storybook's
 * default indexer and overriding the title via makeTitle.
 */
const stories = resolveStories(srcDir, 'prototypes');

const config: StorybookConfig = {
  stories,
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  experimental_indexers: (existingIndexers = []) => {
    const prototypeIndexer: Indexer = {
      test: /[\\/]prototypes[\\/].*\.stories\.[jt]sx?$/,
      createIndex: async (fileName, options) => {
        const csfIndexer = existingIndexers.find((indexer) => indexer.test.test(fileName));
        if (!csfIndexer) {
          throw new Error(`No default CSF indexer found for prototype story: ${fileName}`);
        }
        const title = derivePrototypeTitle(fileName);
        const entries = await csfIndexer.createIndex(fileName, {
          ...options,
          // Force the location-derived title, overriding any hand-written meta `title`.
          makeTitle: () => title,
        });
        return entries.map((entry) => ({
          ...entry,
          tags: [...new Set([...(entry.tags ?? []), ...PROTOTYPE_TAGS])],
        }));
      },
    };
    return [prototypeIndexer, ...existingIndexers];
  },
};

export default config;
