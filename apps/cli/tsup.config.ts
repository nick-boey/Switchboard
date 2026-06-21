import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// The bin's version is baked in at build time so the packaged artifact reports it without a
// runtime filesystem read (it must boot standalone — design Decision 8).
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

// Decision 1: the `switchboard` bin is bundled with tsup for a clean npm artifact.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node26',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // The bin is executed, not imported as a typed library, so no declarations are emitted
  // here. CLI source is still type-checked via project references (`tsc -b`).
  dts: false,
  banner: { js: '#!/usr/bin/env node' },
  // The workspace packages (and their transitive deps — notably the OpenTelemetry SDK, which
  // uses dynamic `require()` that cannot be ESM-bundled) stay external and resolve from
  // `node_modules` at runtime. They ship via this package's `dependencies`, so an installed
  // bin boots without a pnpm *workspace* checkout. The packaged-CLI smoke test (Decision 8)
  // exercises the built bin against the installed dependency tree.
  // Replace the `__CLI_VERSION__` ambient constant with the manifest version.
  define: { __CLI_VERSION__: JSON.stringify(version) },
});
