## Context

Switchboard is greenfield (only OpenSpec scaffolding + planning docs exist). `foundations`
establishes the buildable/testable monorepo and the runtime/security spine — the API
skeleton, auth gate, observability, and the Vitest/Playwright harness — that every later
change builds on. The programme architecture and cross-cutting decisions are fixed on the
[programme page](../../../docs/plans/switchboard/mvp.md); the runtime spike
([findings](../../../docs/dev/spikes/runtime-spike.md)) is **complete (GO)** and supplies
the auth/bind inputs used here. Constraints: TypeScript-only, pnpm workspaces, Just, TDD
mandatory, mobile-first web, server reachable only via Tailscale.

## Goals / Non-Goals

**Goals:**
- A pnpm-workspaces monorepo (`apps/web`, `apps/server`, `apps/cli`, `packages/shared`,
  `site/`) that builds, lints, type-checks, and tests via `just`.
- The three behavioral capabilities: `app-runtime` (Hono skeleton + `start(ctx)` +
  `RuntimeContext` + health + loopback bind), `api-auth-gate` (identity allowlist + bearer
  fallback), `observability` (OTel + redaction).
- The test harness later changes depend on: Vitest, Playwright + temp-git fixture, API
  contract tests, auth/bind tests, redaction tests, Storybook with prototype quarantine.
- The retro Mantine theme tokens + a mobile-first app shell (scaffold, not screens).
- The permanent base LikeC4 model + the foundational docs.

**Non-Goals:**
- No git / GitHub / tmux services (changes 3–5) and no real feature screens (change 2+).
- No GitHub PAT / git credential helper yet — `foundations` only reserves the config slot;
  the helper is `repo-clone-browse`. The **subprocess/PAT-redaction tests** (no token in
  process args / remotes / logs) belong there too, where subprocesses and the PAT exist;
  `foundations` covers **telemetry-span** redaction only.
- No multi-user authorization (future), no Seq instance (deferred), no Docker/Tailscale
  orchestration in the CLI (that is `runtime-cli-docker`).

## Decisions

**1. Monorepo & build tooling.** pnpm workspaces + TypeScript project references; `just`
recipes wrap the per-package scripts. Vite builds `apps/web`; `tsc` builds
`packages/shared` and `apps/server`; the `apps/cli` bin is bundled with `tsup` for a clean
npm artifact. *Alternative considered:* Turborepo/Nx — rejected as overkill at MVP scale;
pnpm + just is enough and lower-ceremony.

**2. `RuntimeContext` + `start(ctx)`.** Services and the server receive a single
`RuntimeContext` = `{ workspaceRoot, config, logger, telemetry, identity }`; no host-global
paths are read inside service code (preserves the container-per-user path). The server
entrypoint is `start(ctx: RuntimeContext): Promise<ServerHandle>` where `ServerHandle` has
`{ url, close() }` for graceful shutdown. The CLI and Playwright both construct a
`RuntimeContext` and call `start` — the same shipped path, not a dev-only shim.

**3. Auth gate (informed by the spike).** A Hono middleware on all routes **except the
unauthenticated `/health` liveness endpoint**, reject-by-default:
- **Loopback bind only** (`127.0.0.1`); in the container deployment `tailscale serve` is
  the *exclusive* ingress.
- **The security boundary is network isolation, not the headers.** Serve injects
  `tailscale-user-login` (+ `tailscale-headers-info`, CGNAT `x-forwarded-for`), but any
  client that can reach the loopback ingress could set those headers too — so the markers
  *select a path*, they do not *prove* identity. Identity is therefore trusted only when
  config `trustServeIdentity` is enabled, which is set **only** in a deployment guaranteeing
  serve-exclusive ingress, and defaults **off**.
- **Identity path** (`trustServeIdentity` on): trust `tailscale-user-login` against the
  allowlist (seed `nick-boey@github`); admit without a bearer token.
- **Bearer path** (always available; the only path when trust is off): require
  `Authorization: Bearer <token>` matching `~/.switchboard`.
- When trust is **off**, `tailscale-user-*` headers are ignored regardless of markers (the
  spoof-safe default — covered by a negative test).
- **Residual risk:** with trust on, a process that bypasses serve to reach the loopback
  ingress could spoof an identity. Accepted for the single-tenant MVP (mitigated by network
  isolation); the deferred hardening is a **Unix-domain-socket serve ingress** (only serve
  can write it) — a `runtime-cli-docker` concern.
- Strict CORS (same-origin/configured; no wildcard; non-browser no-`Origin` requests pass
  to the auth rules). *Alternative:* trust headers unconditionally — rejected (spoofable).

**4. API contract (Hono RPC + Zod).** Routes are defined with Zod validators; the server
exports its `AppType` and `packages/shared` re-exports the typed `hc` client factory. Every
mutation validates input at runtime. A **contract test** imports the client against the
server type and fails on drift. *Alternative:* tRPC — rejected (redundant over Hono RPC).

**5. Observability + redaction.** OTel SDK (semconv) instruments the Hono server. A span
processor scrubs attributes against a **blocklist** (auth headers, bearer/PAT, clone URLs,
branch names, absolute paths, command args, GitHub error bodies) before export. Exporter is
selected by config: `none` (default) / `console` (dev) / `otlp` (Seq later). Redaction
tests run before any exporter is enabled. (This is *telemetry-span* redaction; the
subprocess/PAT redaction tests belong to `repo-clone-browse` — see Non-Goals.)

**6. Config (`~/.switchboard`).** `packages/shared` owns the Zod schema for
`~/.switchboard/config.json`: bearer token (generated on first run), `trustServeIdentity`
(default `false`), identity allowlist, telemetry exporter (`none`/`console`/`otlp`), and a
reserved `github` slot. A standalone **`loadConfig()`** reads + validates the file (creating
secure `600` defaults on first run) and runs **before** `start(ctx)`; `start(ctx)` receives
the parsed config on the `RuntimeContext` and performs no file I/O. The CLI and Playwright
both call `loadConfig()` then `start(ctx)`.

**7. Web shell + theme + Storybook.** React + Vite + Mantine, with TanStack Query for
server state. The '50s retro switchboard look is a Mantine theme (tokens: embossed
surfaces, plug/jack motifs, geometric type) — tokens + a couple of primitives only; full
treatment is `ui-prototypes-mvp`. Storybook **quarantine**: prototype stories live in
`apps/web/src/prototypes/<change-name>/` and are excluded from the unit run, the
visual-snapshot run, autodocs, the package `exports`, and production bundles (enforced by
path globs + a lint rule against importing `prototypes/**` from app code).

**8. CLI thin shell.** `apps/cli` ships `switchboard` with `--version` and a `start` that
builds a `RuntimeContext` and calls the server's `start(ctx)` for a **local** run only. A
**packaged-CLI smoke test** invokes the built bin (not a workspace import). Docker/Tailscale
orchestration is explicitly deferred to `runtime-cli-docker`.

**9. LikeC4 base model (bootstrap).** `site/` carries Astro + the pinned LikeC4; the
permanent base model (`docs/dev/Architecture/*.c4`: `Switchboard.WebSPA/.Api/.Cli`,
externals `GitHub`/`TmuxHost`/`ClaudeBackplane`/`Tailscale`/`MobileApp`, context +
container views) is authored as an implementation task and validated with
`pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`. Later changes
add `Planned/<change>.c4` `#todo` overlays.

**10. Foundations split trigger (Codex #12).** Kept as one change. **Trigger:** if the
build/test harness cannot reach green quickly during implementation, split the
design-system/Storybook setup into its own change and keep `foundations` to
build/server/harness. Not pre-split (avoids speculative fragmentation).

## Testing strategy

**Harness gap assessment:** no harness exists (greenfield) — it must be built first.
Therefore `tasks.md`'s **first group is "Test infrastructure"**, before any feature code.

What it must stand up:
- **Vitest** workspace config; conventions for unit tests beside source.
- **Playwright** config + a **temp-git fixture** helper (init repos in an OS temp dir, torn
  down per test) — unused by `foundations` itself but required by changes 3–5, and proven
  here with a smoke test.
- Test doubles seam: services take `RuntimeContext`, so fakes inject via `ctx`.

Per-capability tests:
- **`app-runtime`:** unit — `loadConfig()` creates secure `600` defaults / validates /
  rejects bad config with a field-named error; `start(ctx)` boots on loopback; `/health`
  responds; `close()` shuts down cleanly. Contract — client↔server type/Zod drift fails.
- **`api-auth-gate`:** unit — `/health` reachable unauthenticated; no creds on a protected
  route → 401; valid/invalid bearer; with `trustServeIdentity` **on**, simulated serve
  headers for an allowlisted user → admitted, non-allowlisted → 403; with trust **off**
  (default), full markers + allowlisted identity → rejected (the spoof-safe negative test);
  CORS denies a disallowed origin, allows the app origin, and passes no-`Origin` requests;
  bind-address test asserts loopback-only. (Real `serve` is covered by the spike +
  `runtime-cli-docker`; unit/E2E simulate the proxy by injecting/withholding markers and
  toggling `trustServeIdentity`.)
- **`observability`:** unit — redaction blocklist scrubs secrets / paths / args / clone-URLs
  / branch-names from spans; exporter selection honors config (`none` default emits nothing,
  `console`, `otlp`).
- **Web:** Storybook stories for the shell/theme primitives; a Playwright E2E that loads the
  shell through the bearer path against a real `start(ctx)` server.
- **CLI:** packaged-bin smoke test (`switchboard --version`, `start` boots + `/health`).

## Risks / Trade-offs

- **[Risk] `foundations` blast radius** (Codex) → the split trigger (Decision 10);
  sequence the harness first so "green" is reached early.
- **[Risk] Identity-header spoofing on loopback** → trust identity only with serve markers;
  strip otherwise; bearer for direct access; loopback bind (Decision 3).
- **[Risk] Hono RPC type coupling across the workspace boundary** → explicit `AppType`
  export + a failing contract test on drift (Decision 4).
- **[Risk] OTel leaking secrets/paths** → redaction blocklist + tests gate any exporter
  (Decision 5).
- **[Risk] E2E cannot use real Tailscale `serve`** → simulate serve markers in tests; real
  serve already proven by spike 0 and owned by `runtime-cli-docker`.
- **[Trade-off] No DB** → fine for `foundations` (no entities yet); the operation
  ledger/lock arrives with the changes that do long-running work.

## Open Questions

- Exact pinned versions (Mantine, Vite, Storybook builder, LikeC4) and whether `tsup` or
  plain `tsc` suffices for the CLI bin — settle during implementation.
- Bearer-token surfacing UX (printed on `start` vs a `~/.switchboard` file the user reads) —
  minor; settle when wiring the CLI `start`.
