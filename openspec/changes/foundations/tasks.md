## 1. Test infrastructure

- [ ] 1.1 Bootstrap the pnpm workspace (`apps/web`, `apps/server`, `apps/cli`, `packages/shared`, `site/`), TypeScript project references, base `tsconfig`, ESLint/Prettier, and `just` recipes (`install`, `build`, `lint`, `typecheck`, `test`, `e2e`)
- [ ] 1.2 Configure Vitest (workspace-level) with a sample passing test proving the unit harness runs
- [ ] 1.3 Configure Playwright and a reusable **temp-git fixture** helper (init/teardown repos in an OS temp dir) with a smoke test
- [ ] 1.4 Establish the test-double seam: a shared `RuntimeContext` test factory so services/server take fakes via `ctx`
- [ ] 1.5 Configure Storybook with **prototype quarantine** — exclude `apps/web/src/prototypes/**` from the unit + snapshot runs, autodocs, package `exports`, and production bundles; add a lint rule forbidding imports from `prototypes/**` in app code

## 2. app-runtime — config & lifecycle

- [ ] 2.1 Write failing tests: config schema (valid / invalid / first-run defaults at mode `600`); `start(ctx)` boots on `127.0.0.1`; `GET /health` → 200; loopback-only bind; invalid config refuses to start with a field-named error; `close()` shuts down gracefully
- [ ] 2.2 Implement the `~/.switchboard` config Zod schema + `RuntimeContext` type in `packages/shared`
- [ ] 2.3 Implement the config loader (create secure defaults, generate bearer token, validate, clear errors) to green
- [ ] 2.4 Implement the Hono app + `start(ctx)` / `ServerHandle` (loopback bind, `/health`, graceful `close()`) to green

## 3. app-runtime — typed API contract

- [ ] 3.1 Write failing tests: invalid request body → 422 without invoking the handler; client/server contract drift fails
- [ ] 3.2 Implement Hono RPC routes with Zod validators, export `AppType`, expose the typed `hc` client factory from `packages/shared`, and make the contract test pass

## 4. api-auth-gate

- [ ] 4.1 Write failing tests: no creds → 401; valid bearer → allow; invalid bearer → 401; allowlisted serve identity → allow without bearer; non-allowlisted serve identity → 403; `tailscale-user-*` without serve markers stripped/ignored; strict CORS denies a disallowed origin
- [ ] 4.2 Implement the auth middleware (serve-marker detection, identity allowlist, bearer fallback, spoof-header stripping) + the CORS policy to green

## 5. observability

- [ ] 5.1 Write failing tests: a semconv span is recorded per request; the redaction blocklist scrubs secrets/paths/args/clone-URLs/GitHub-error-bodies; exporter selection (default `none` emits nothing; `otlp` exports)
- [ ] 5.2 Implement OTel instrumentation + the redacting span processor + config-driven exporter selection to green

## 6. Web shell, theme & client

- [ ] 6.1 Implement the Mantine provider + the '50s retro switchboard **theme tokens** and a couple of primitives, with Storybook stories
- [ ] 6.2 Implement the mobile-first app shell, TanStack Query wiring, and the typed `hc` client; a placeholder route only
- [ ] 6.3 Write a Playwright E2E (initially failing) that loads the shell through the bearer path against a real `start(ctx)` server, then wire it to green

## 7. CLI thin shell

- [ ] 7.1 Write a failing packaged-CLI smoke test: build the bin, then `switchboard --version` and `switchboard start` boots a local server whose `/health` responds
- [ ] 7.2 Implement `apps/cli` (`switchboard` bin via tsup) with `--version` and a local `start` (build `RuntimeContext`, call the server's `start(ctx)`) to green — no Docker/Tailscale

## 8. Architecture model & documentation

- [ ] 8.1 Set up `site/` (Astro + pinned LikeC4); author the permanent base model under `docs/dev/Architecture/*.c4` (`Switchboard.WebSPA/.Api/.Cli` + externals `GitHub`/`TmuxHost`/`ClaudeBackplane`/`Tailscale`/`MobileApp` + context & container views); validate with `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture` — resolves the docs-migration `docs/dev/Architecture/` row
- [ ] 8.2 Author `README.md` (install / build / run locally) — resolves its docs-migration row
- [ ] 8.3 Author `docs/dev/Contributing/development-workflow.md` — resolves its docs-migration row
- [ ] 8.4 Author `docs/dev/Contributing/testing.md` (harness conventions: temp-git fixture, prototype quarantine) — resolves its docs-migration row

## 9. Verify

- [ ] 9.1 Run `just lint typecheck test e2e` + `likec4 validate` all green, and `openspec validate foundations` passes
