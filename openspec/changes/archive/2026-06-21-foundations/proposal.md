## Why

Switchboard is greenfield. Before any feature can be built test-first, the programme
needs a buildable, testable, prototypable monorepo **and** the runtime/security spine the
rest of the app hangs off — the API skeleton, the auth gate, observability, and the
Vitest/Playwright test harness every later change's TDD depends on. `foundations` is that
base layer and nothing else. (The runtime spike — spike 0 — runs *before* this change and
its findings inform the auth/bind/config shape here.)

## What Changes

- **Monorepo + tooling.** pnpm workspaces (`apps/web`, `apps/server`, `apps/cli`,
  `packages/shared`, `site/`) with TypeScript project references and `just` as the task
  runner.
- **Web shell.** React + Vite + Mantine, a mobile-first app layout, the '50s retro
  switchboard **theme tokens** (embossed labels, plugs, geometric fonts), and Storybook
  configured to **quarantine** `apps/web/src/prototypes/**` from snapshots, the unit run,
  autodocs, the published API, and production imports. A placeholder route only — real
  screens come later.
- **API runtime skeleton.** A Hono app with **Hono RPC + Zod**, a health endpoint, and a
  programmatic `start(ctx)` that takes a **`RuntimeContext`** (workspace root, config,
  logger, telemetry, identity), **bound to loopback**, with graceful shutdown. No
  git/github/tmux services yet.
- **Auth gate.** Reject-by-default on the API; a **bearer token** (from `~/.switchboard`)
  for direct/local access and, behind `tailscale serve`, trust of the
  `Tailscale-User-Login` identity against an allowlist; strict origin/CORS; identity
  headers trusted **only** when the request arrived via `serve`. (Identity path validated
  in spike 0; bearer path ships regardless.)
- **Observability.** OpenTelemetry (semconv) instrumentation with a **redaction policy**
  (no PATs, clone URLs, branch names, local paths, command args, or GitHub errors in
  spans) and OTLP export behind a config toggle (off by default; Seq wired later).
- **Test harness.** Vitest (unit) and Playwright (E2E) with a **temporary-git fixture**,
  plus auth/bind-address tests, API contract tests (web↔server schema drift), and
  telemetry-redaction tests. (Subprocess/PAT-redaction tests are deferred to
  `repo-clone-browse`, where subprocesses and the PAT exist.) This is the harness later
  changes depend on.
- **Architecture model.** The permanent base **LikeC4** model under
  `docs/dev/Architecture/` (authored during implementation, validated via `site/`), since
  the LikeC4 tooling is itself a deliverable here.
- **Docs.** `README.md`, `docs/dev/Contributing/development-workflow.md` (referenced by
  `openspec/config.yaml` but missing), and `docs/dev/Contributing/testing.md`.

No breaking changes (greenfield).

## Capabilities

### New Capabilities

- `app-runtime`: the Hono API runtime skeleton — `start(ctx)`/`RuntimeContext` lifecycle,
  loopback bind, health endpoint, graceful shutdown, and the Zod-validated Hono RPC
  request/response contract.
- `api-auth-gate`: the application auth gate — reject-by-default, Tailscale-identity
  allowlist behind `serve`, bearer-token fallback, strict CORS, and the rule that
  identity headers are trusted only via `serve`.
- `observability`: OpenTelemetry instrumentation with the secret/path **redaction policy**
  and the OTLP export toggle.

### Modified Capabilities

<!-- None — greenfield; no existing capabilities. -->

## Impact

- **New code**: `apps/web`, `apps/server`, `apps/cli` (thin shell only), `packages/shared`
  (Zod config schema + Hono RPC types), `site/` (Astro + LikeC4).
- **New dependencies**: React, Vite, Mantine, Storybook, Hono + Zod, TanStack Query,
  OpenTelemetry SDK, Vitest, Playwright, pnpm, just, LikeC4.
- **Conventions established** (relied on by every later change): the prototype-quarantine
  setup, the temp-git E2E fixture, the `~/.switchboard` config schema, the
  `RuntimeContext` shape, and the auth gate.
- **Cross-change**: this builds the test harness all of changes 2–6 depend on; its design
  consumes spike-0 findings (auth/bind/config/credential persistence/supervision).
- **UI surfaces / prototypes**: `foundations` scaffolds the app shell + theme tokens but
  does **not** explore UI patterns — the dedicated prototyping is `ui-prototypes-mvp`.
  **No prototypes in this change.**
