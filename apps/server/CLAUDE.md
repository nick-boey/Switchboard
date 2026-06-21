# CLAUDE.md — @switchboard/server

Module-specific guidance; see the repo-root CLAUDE.md for shared commands and workflow.

Hono API server (Node via `@hono/node-server`). This is the **API layer of a vertical slice** — keep handlers next to the slice they serve.

- Routes validate input with `@hono/zod-validator` against Zod schemas from `@switchboard/shared`. The schema is the single source of truth — never redefine a request/response shape here.
- `contract.ts` defines the typed RPC contract; `client.ts` is the typed client that `apps/web` consumes. Keep them in sync with the routes.
- **Telemetry redaction is a hard rule.** Spans pass through `RedactingSpanProcessor` (`telemetry.ts`). Never put secrets or sensitive values in span attributes or logs: no PATs, clone URLs, branch names, local filesystem paths, or command args. Add new sensitive keys to the blocklist in `telemetry.ts`.
- Build: `tsc -b` (emits to `dist/`). Unit tests resolve TS source via the `switchboard-source` condition — no build needed to run them.
