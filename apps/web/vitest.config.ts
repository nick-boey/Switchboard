import { defineConfig } from 'vitest/config';

/**
 * Web-package unit/story test config. Scoped to `apps/web/src` so
 * `pnpm --filter @switchboard/web test` runs only the web suite. Mirrors the root harness:
 * resolves workspace packages to their TypeScript source (`switchboard-source`) and honours the
 * prototype quarantine (design Decision 7). The automatic JSX runtime is picked up from
 * `apps/web/tsconfig.json` (`jsx: react-jsx`) so the shell smoke story renders without a React
 * import.
 */
export default defineConfig({
  resolve: {
    conditions: ['switchboard-source'],
  },
  // Vite 8 no longer feeds `resolve.conditions` into the Node/SSR resolver Vitest uses for
  // `environment: 'node'`; mirror the source condition here so `@switchboard/*` workspace
  // imports resolve to TypeScript source (not the unbuilt `dist`). See the root vitest.config.ts.
  ssr: {
    resolve: {
      conditions: ['switchboard-source'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      // Prototype quarantine (design Decision 7), narrowed to per-change sketch folders
      // (`src/prototypes/<change>/**`) so shared prototype-harness modules at the
      // `src/prototypes/` root (e.g. `define-prototype-meta.ts`) and their co-located tests
      // ARE collected, while sketch folders stay quarantined.
      'src/prototypes/*/**',
      // Storybook stories are not unit tests (keeps every `*.stories.*` out regardless).
      '**/*.stories.*',
    ],
  },
});
