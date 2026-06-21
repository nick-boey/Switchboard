# CLAUDE.md — @switchboard/cli

Module-specific guidance; see the repo-root CLAUDE.md for shared commands and workflow.

TypeScript CLI bundled with **tsup** (not `tsc`). Exposes the `switchboard` bin → `dist/index.js`. Depends on `@switchboard/server` and `@switchboard/shared`.

- **Gotcha:** unlike `shared`/`server`, the CLI's Vitest tests exercise the **built** `dist/index.js`, not TS source. Build before testing the CLI: `pnpm --filter @switchboard/cli build` then `pnpm --filter @switchboard/cli test`.
