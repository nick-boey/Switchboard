## 1. Test infrastructure

- [x] 1.1 Bootstrap the pnpm workspace (`apps/web`, `apps/server`, `apps/cli`, `packages/shared`, `site/`), TypeScript project references, base `tsconfig`, ESLint/Prettier, and `just` recipes (`install`, `build`, `lint`, `typecheck`, `test`, `e2e`)
- [x] 1.2 Configure Vitest (workspace-level) with a sample passing test proving the unit harness runs
- [x] 1.3 Configure Playwright and a reusable **temp-git fixture** helper (init/teardown repos in an OS temp dir) with a smoke test
- [x] 1.4 Establish the test-double seam: a shared `RuntimeContext` test factory so services/server take fakes via `ctx`
- [x] 1.5 Configure Storybook with **prototype quarantine** — exclude `apps/web/src/prototypes/**` from the unit + snapshot runs, autodocs, package `exports`, and production bundles; add a lint rule forbidding imports from `prototypes/**` in app code

## 2. app-runtime — config & lifecycle

- [x] 2.1 Write failing tests: config schema (valid / invalid / first-run defaults at mode `600`, `trustServeIdentity` off by default); `loadConfig()` reads+validates and throws a field-named error on invalid config; `start(ctx)` boots on `127.0.0.1` from the parsed config; `GET /health` → 200 unauthenticated; loopback-only bind; `close()` shuts down gracefully
- [x] 2.2 Implement the `~/.switchboard` config Zod schema (bearer token, `trustServeIdentity` default `false`, identity allowlist, telemetry exporter, reserved `github` slot) + `RuntimeContext` type in `packages/shared`
- [x] 2.3 Implement standalone `loadConfig()` (create secure `600` defaults, generate bearer token, validate, clear errors) to green
- [x] 2.4 Implement the Hono app + `start(ctx)` / `ServerHandle` taking the parsed config (loopback bind, `/health`, graceful `close()`, no file I/O in `start`) to green

## 3. app-runtime — typed API contract

- [x] 3.1 Write failing tests: invalid request body → 422 without invoking the handler; client/server contract drift fails
- [x] 3.2 Implement Hono RPC routes with Zod validators, export `AppType`, expose the typed `hc` client factory from `packages/shared`, and make the contract test pass

## 4. api-auth-gate

- [x] 4.1 Write failing tests: `/health` reachable unauthenticated; no creds on a protected route → 401; valid bearer → allow; invalid bearer → 401; with `trustServeIdentity` on — allowlisted serve identity → allow without bearer, non-allowlisted → 403; with trust off (default) — full serve markers + allowlisted identity → rejected (spoof-safe negative test); CORS denies a disallowed origin, allows the app origin, and passes no-`Origin` requests
- [x] 4.2 Implement the auth middleware (`/health` exemption, `trustServeIdentity`-gated identity trust, serve-marker detection, identity allowlist, bearer fallback, ignore identity headers when trust is off) + the CORS policy to green

## 5. observability

- [x] 5.1 Write failing tests: a semconv span is recorded per request; the redaction blocklist scrubs secrets/paths/args/clone-URLs/branch-names/GitHub-error-bodies; exporter selection (default `none` emits nothing; `console` writes to console; `otlp` exports)
- [x] 5.2 Implement OTel instrumentation + the redacting span processor + config-driven exporter selection to green

## 6. Web shell, theme & client

- [x] 6.1 Write a failing Playwright E2E (plus a shell smoke-story assertion) that loads the app shell through the bearer path against a real `start(ctx)` server
- [x] 6.2 Implement the Mantine provider + the '50s retro switchboard **theme tokens** and a couple of primitives, with Storybook stories
- [x] 6.3 Implement the mobile-first app shell, TanStack Query wiring, and the typed `hc` client (placeholder route only) to green

## 7. CLI thin shell

- [x] 7.1 Write a failing packaged-CLI smoke test: build the bin, then `switchboard --version` and `switchboard start` boots a local server whose `/health` responds
- [x] 7.2 Implement `apps/cli` (`switchboard` bin via tsup) with `--version` and a local `start` (build `RuntimeContext`, call the server's `start(ctx)`) to green — no Docker/Tailscale

## 8. Architecture model & documentation

- [x] 8.1 Set up `site/` (Astro + pinned LikeC4); author the permanent base model under `docs/dev/Architecture/*.c4` (`Switchboard.WebSPA/.Api/.Cli` + externals `GitHub`/`TmuxHost`/`ClaudeBackplane`/`Tailscale`/`MobileApp` + context & container views); validate with `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture` — resolves the docs-migration `docs/dev/Architecture/` row
- [x] 8.2 Author `README.md` (install / build / run locally) — resolves its docs-migration row
- [x] 8.3 Author `docs/dev/Contributing/development-workflow.md` — resolves its docs-migration row
- [x] 8.4 Author `docs/dev/Contributing/testing.md` (harness conventions: temp-git fixture, prototype quarantine) — resolves its docs-migration row

## 9. Verify

- [x] 9.1 Run `just lint typecheck test e2e` + `likec4 validate` all green, and `openspec validate foundations` passes

## 10. Codex implementation-review remediation

- [x] 10.1 (High → §5 observability) Mask **clone URLs and branch names independent of attribute key** in the redacting span processor (value-based clone-URL detection + a curated sensitive-key classification for branch/ref/clone/remote/repo variants), and add exporter-path tests for a plain clone URL value and a branch value
- [x] 10.2 (Medium → §3 contract) Replace the deep `../../../server/dist/app.js` `AppType` import with a **stable type-only contract** from `@switchboard/server` (declared dev/type dependency + project reference) so isolated web typechecks resolve and the web bundle carries no server runtime
- [x] 10.3 (Medium → §6) Split `@switchboard/shared` exports into **browser-safe** (config schema, client, types) and **node** (`loadConfig`) subpaths so the browser barrel no longer pulls `node:*`; update server/cli/web importers
- [x] 10.4 (Low) Rename the CLI package to `@switchboard/cli` (keep `bin: { switchboard }`) to disambiguate `pnpm --filter`
- [x] 10.5 (Low → §8.2) Refresh `README.md` status + local-run to reflect the implemented skeleton (Hono app/auth/observability, CLI `--version`/`start`, theme tokens, app shell are built)
- [x] 10.6 Re-run the full gate (`just lint typecheck test e2e` + `likec4 validate` + `openspec validate foundations`) green after remediation
