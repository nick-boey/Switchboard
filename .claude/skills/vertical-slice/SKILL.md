---
name: vertical-slice
description: Use when adding or modifying a feature in Switchboard — explains the feature-based vertical-slice layout across packages/shared, apps/server, and apps/web, and how to build a slice red-green (TDD). Complements the OpenSpec switch-* workflow skills (which govern process/state, not code structure).
---

# Vertical-slice architecture

Switchboard is organized by **feature**, not by technical layer. One feature = one vertical slice that runs top-to-bottom through the monorepo. Do not create horizontal buckets (`services/`, `controllers/`, generic `utils/`) that collect unrelated features.

This skill is about **code structure**. For *which* workflow a change follows (fix vs feature vs feature-ui) and its artifact gates, use `switch-change` first.

## Where each part of a slice lives

| Concern | Location | Stack |
|---|---|---|
| Contract / Zod schema / shared types | `packages/shared` | Zod 4, exported via `switchboard-source` condition |
| API route + handler | `apps/server` | Hono + Zod validation |
| UI | `apps/web` | React 19 + Mantine, Vite |
| CLI entry (if applicable) | `apps/cli` | tsup-bundled bin |
| Unit tests | co-located `*.test.ts` next to the code | Vitest |
| E2E (if applicable) | `e2e/*.spec.ts` | Playwright (needs `just build`) |

The schema in `packages/shared` is the single source of truth that the server validates against and the web client consumes (Hono RPC types). Define it once there; never duplicate the shape in server or web.

## Principles

- **Keep a slice's code together.** A reader should find everything for a feature by following the slice, not by hopping across layer folders.
- **Minimize cross-slice coupling.** If two slices need the same thing, lift it into `packages/shared` deliberately — don't reach into another slice's internals.
- **Respect the prototype quarantine.** UI exploration happens in `apps/web/src/prototypes/**` (Storybook only). Production app code must not import from `prototypes/**` (ESLint enforces it). Promote a prototype by moving it into the slice, not by importing it.

## Building a slice (red-green TDD)

`tasks.md` for a change is ordered failing-test-first. For each slice piece:

1. **Schema** — write a Vitest test asserting the Zod schema parses/rejects expected shapes → watch it fail → implement in `packages/shared`. Run `just test`.
2. **Server route** — write a test for the handler (valid + invalid input, status codes) → fail → implement the Hono route in `apps/server`. Run `just test`.
3. **Web UI** — write a component/interaction test → fail → implement in `apps/web`. Run `just test`.
4. **E2E (if the slice has a user-facing path)** — add an `e2e/*.spec.ts`; run `just build` then `just e2e`.

After implementation, `just lint` and `just typecheck` must pass before the change can archive.
