import { defineConfig } from 'vitest/config';

// CLI package test config. The packaged-CLI smoke test (design Decision 8) spawns the BUILT
// `dist/index.js`, so no `switchboard-source` source resolution is needed here — it exercises
// the packaged artifact. Timeouts are generous: each case boots a child Node process.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
