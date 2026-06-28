# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

`just` is the canonical task runner (wraps pnpm). Run from the repo root:

- `just install` — install workspace deps (pnpm 11, Node >=26)
- `just build` — build every package (tsc for shared/server, tsup for cli, vite for web)
- `just run` — run the full stack locally: API server (loopback, against the real `~/.switchboard`) + web UI (`localhost:5173`). Reads the server's URL + bearer token from `~/.switchboard`. Ctrl-C stops both. Web hot-reloads; server runs from `dist`, so server-code changes need a restart.
- `just test` — unit tests (Vitest). No build needed first (see Testing).
- `just e2e` — Playwright E2E. **Requires `just build` first** (resolves built packages).
- `just lint` — ESLint flat config + `prettier --check .`
- `just typecheck` — `tsc -b` across project references
- `pnpm format` — `prettier --write .` (auto-format)

Single unit test: `pnpm exec vitest run path/to/file.test.ts`.

## Development workflow (SDD + TDD)

This repo uses spec-driven development on top of OpenSpec. For any non-trivial feature, fix, or modification, **start with the `switch-change` skill** — it routes to the right workflow (`switch-fix` / `switch-feature` / `switch-feature-ui`) by reading `openspec status`. Never guess the current stage; the artifact DAG in `openspec/changes/<name>/` is the only state store. Tiny mechanical edits (typos, comment fixes) can skip this.

Within a change, follow **red-green TDD**: `tasks.md` is ordered failing-test-first, then implementation. Write the failing test, watch it fail, then make it pass.

## Architecture

**Feature-based vertical slice architecture.** Organize a feature as one slice spanning the monorepo, not as horizontal layers:

- Contract/Zod schema → `packages/shared`
- API route + handler → `apps/server` (Hono + Zod)
- UI → `apps/web` (React 19 + Mantine, Vite)
- Unit tests co-located next to the code they cover (`*.test.ts`)

Keep a slice's code together and minimize cross-slice coupling. Avoid global `services/`, `controllers/`, or `utils/` buckets that cut across features.

Monorepo layout: `apps/{cli,server,web}`, `packages/shared`, `site` (Astro+LikeC4, deferred), `e2e` (Playwright), `openspec` (workflow artifacts), `docs`.

## Code style

- TypeScript strict mode with `noImplicitOverride`, `noUnusedLocals`/`noUnusedParameters` (use `_` prefix to intentionally ignore), `noFallthroughCasesInSwitch`. Target ES2023, module NodeNext.
- Prettier: single quotes, semicolons, trailing commas, **100-col width**. A PostToolUse hook auto-formats edited files; don't hand-format.

## Testing

- Unit tests run against **TypeScript source** via the `switchboard-source` export condition — no pre-build required for `packages/shared` / `apps/server`. Exception: `apps/cli` tests exercise the built `dist/index.js`, so build the cli first when changing it.
- E2E uses a throwaway temp-git fixture (`fixtures/temp-git.ts`). `just e2e` assumes `just build` has run.

## Gotchas

- **Prototype quarantine**: Storybook prototypes live in `apps/web/src/prototypes/**` and are excluded from unit tests, visual snapshots, and the published API. App code (`apps/web/src/**`) **must not import** from `prototypes/**` — ESLint enforces this. Promotion to production is a deliberate move, not an import.
- **Tailscale identity headers** (`tailscale-headers-info`, etc.) are trusted **only on the serve path**, never on direct loopback. Direct loopback access must authenticate with a bearer token from `~/.switchboard`.

## Repo etiquette

PRs target `main` (no strict branch-naming rule). Link the relevant `openspec/changes/<name>/` artifacts in the PR description.
