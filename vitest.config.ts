import { defineConfig } from 'vitest/config';

// Workspace-level unit-test config (Vitest 4 — `vitest.workspace.ts` was removed in favour
// of a single config). Covers unit tests beside source across packages/* and apps/*.
export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript source during unit tests so the
    // unit harness does not require a prior build.
    conditions: ['switchboard-source'],
  },
  // Vite 8 no longer feeds `resolve.conditions` into the Node/SSR resolver that Vitest uses
  // for `environment: 'node'`, so the `switchboard-source` source-resolution must be set here
  // too — otherwise every unit test that imports a workspace package at runtime fails to
  // resolve `@switchboard/shared` / `@switchboard/server` (falls back to the unbuilt `dist`).
  ssr: {
    resolve: {
      conditions: ['switchboard-source'],
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-types/**',
      // Prototype quarantine (design Decision 7), narrowed to per-change sketch folders so
      // shared prototype-harness modules at the `src/prototypes/` root and their co-located
      // tests ARE collected, while sketch folders stay quarantined. Mirrors apps/web/vitest.config.ts.
      'apps/web/src/prototypes/*/**',
      // Storybook stories are not unit tests.
      '**/*.stories.*',
      // Playwright owns the e2e directory.
      'e2e/**',
    ],
  },
});
