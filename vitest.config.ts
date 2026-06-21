import { defineConfig } from 'vitest/config';

// Workspace-level unit-test config (Vitest 4 — `vitest.workspace.ts` was removed in favour
// of a single config). Covers unit tests beside source across packages/* and apps/*.
export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript source during unit tests so the
    // unit harness does not require a prior build.
    conditions: ['switchboard-source'],
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-types/**',
      // Prototype quarantine (design Decision 7).
      'apps/web/src/prototypes/**',
      // Storybook stories are not unit tests.
      '**/*.stories.*',
      // Playwright owns the e2e directory.
      'e2e/**',
    ],
  },
});
