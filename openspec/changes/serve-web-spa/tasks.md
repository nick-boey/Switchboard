# Tasks — serve-web-spa

## 1. Test infrastructure

- [x] 1.1 Extend the server test harness (`makeTestContext` / `@switchboard/shared/testing`)
  to accept an optional `webRoot`, and add a fixture web bundle (a minimal `index.html` +
  one `/assets/<file>`) so SPA static-serving + history-fallback behaviour is assertable in
  unit/integration tests. _(`makeTestContext` already spreads overrides — `webRoot` is one; added
  `makeWebBundleFixture()` to `@switchboard/shared/testing` — index.html + /assets/app.js, `omitIndex`
  models the missing-bundle 503 case.)_
- [x] 1.2 Add an integration/E2E harness that runs the **built** server against the **built**
  `apps/web/dist` (as `webRoot`) — the production fallback surface `page-routing` hands off —
  reusable by the verification in group 8. _(`e2e/serve-web-spa.spec.ts` boots
  `start(makeTestContext({ webRoot: apps/web/dist }))` against the built server + web bundle.)_

## 2. Config defaults — empty allowlist (F1)

- [x] 2.1 (red) Test: `configSchema` parses an absent `identityAllowlist` to `[]` (not
  `['nick-boey@github']`), and an explicit allowlist is preserved.
- [x] 2.2 (green) Change `packages/shared/src/config.ts` `identityAllowlist` default to `[]`;
  remove the baked-in identity. Rebuild `@switchboard/shared` `dist` before dependent tests.
  _(Also updated `load-config.test.ts` first-run assertion to expect `[]`; shared suite 96 green.)_

## 3. Reserved `/api/*` namespace + gated boundary (F2)

- [x] 3.1 (red) Tests: every existing API route responds under `/api/...`; an
  unauthenticated `/api/*` request → `401`; an unknown `/api/*` path is gated (`401` unauth)
  and never returns the SPA; `/health` stays public (`200`). **Tokenless serve-identity
  success path** (the served SPA's auth — design Testing strategy): with `trustServeIdentity`
  enabled, a request to a **real** `/api/*` route on the dedicated serve ingress carrying the
  serve markers and an **allowlisted** `tailscale-user-login` and **no** `Authorization`
  header is **admitted** (handled, not `401`/`403`); the same request with a **non-allowlisted**
  identity → `403`; the same markers + identity on the **direct loopback** ingress to `/api/*`
  → rejected unless a bearer token is present.
- [x] 3.2 (green) Refactor `createApp`: mount the chained API routes under a `/api` sub-app
  with `authMiddleware` applied within it plus a gated default-`404`, keeping `/health`
  public at root, **preserving the serve-identity admit path through the restructure so an
  allowlisted tokenless `/api` call still succeeds**, and preserving the chained type inference
  so `AppType` captures `/api`.
- [x] 3.3 (green) Re-pin `apps/server/src/contract.ts` to the `/api`-nested `AppType` and fix
  any server-side `client.ts` consumers; `tsc -b` green.
  _(Ripple also fixed: all `apps/web` call sites `client.repos/worktrees/sessions` → `client.api.*`,
  the session-queries mock, the e2e `api()` helpers (`/api` prefix), and the telemetry span-template
  test (`GET /api/worktrees/...`). tsc ✓, unit 506 ✓, e2e 32 ✓.)_

## 4. Public SPA static serving + history fallback (web-app-serving)

- [x] 4.1 (red) Tests (1.1 harness): `GET /` → `index.html` (no auth); an existing asset is
  served unauthenticated; a non-`/api` clean path (`/<owner>/<repo>`, `/new-repo`) returns
  `index.html` on load/reload; a non-GET non-`/api` request → `404`; `webRoot` unset →
  API-only; `webRoot` set but bundle missing → `503` with `/api` unaffected.
- [x] 4.2 (green) Add `RuntimeContext.webRoot?` to the shared types; implement static serving
  via `@hono/node-server/serve-static` + an `index.html` history-fallback catch-all, ordered
  after the `/api` sub-app and outside the auth gate; missing-bundle → `503`. _(spa.test.ts 6 green;
  `app.use('/assets/*', serveStatic)` + `app.on(['GET','HEAD'],'*', serveIndex)`; tsc ✓.)_

## 5. Web client — same-origin, tokenless (web-app-serving)

- [x] 5.1 (red) Tests: `readRuntimeConfig` defaults `serverUrl` to `window.location.origin`
  when nothing is injected; the client omits `Authorization` when the token is empty;
  injected `VITE_SERVER_URL` + token still take precedence.
- [x] 5.2 (green) Implement in `apps/web/src/api/config.ts` + `client.ts`; confirm route
  calls target the `/api/*` namespace. _(config.test.ts + client.test.ts 5 green; the client test
  asserts the captured fetch URL contains `/api/repos/cloned` and no `authorization` when tokenless.)_

## 6. CLI `--docker` trust default + `webRoot` wiring (F1 / api-auth-gate)

- [x] 6.1 (red) Tests: a **first-run** `--docker` bootstrap (no existing config) CREATES
  `config.json` with `trustServeIdentity: true` + `identityAllowlist: []` (admits nobody
  until a login is added); loading an **existing** `--docker` config without the field
  leaves trust disabled AND leaves a persisted non-empty allowlist untouched (upgrade
  safety, F-A1); an explicit `trustServeIdentity: false` is respected; a non-`--docker`
  runtime defaults trust off; the `--docker` bring-up sets `ctx.webRoot` to the bundled
  image path.
- [x] 6.2 (green) Implement the `--docker` **first-run** trust default (write
  `trustServeIdentity: true` into a newly created config only; respect persisted/absent
  values on load — never flip an existing config on) and the `webRoot` wiring in the CLI
  bootstrap / bring-up. _(`loadConfig` gained `firstRunDefaults` (applied only at creation); bootstrap
  passes it under `--docker`; `buildDockerContext` in docker.ts wires `ctx.webRoot = DEFAULT_WEB_ROOT`
  (`/opt/switchboard/web`). bootstrap + docker-context + load-config tests green; full suite 523.)_

## 7. Docker image bundles the web build (container-runtime)

- [x] 7.1 (green) Dockerfile: `COPY --from=builder /repo/apps/web/dist /opt/switchboard/web`
  into the runtime stage; point the `--docker` `webRoot` at it. _(webRoot wired via
  `DEFAULT_WEB_ROOT` in group 6.)_
- [x] 7.2 (verify) Build the image and confirm it contains the bundle and the server serves
  `index.html` (cheap smoke: override the entrypoint to run the server on the direct ingress
  inside the image and `curl /`). _(Image `switchboard:spa-verify` built; `/opt/switchboard/web/index.html`
  + `assets/index-*.js/.css` present; in-image smoke — deployed `createApp` with `webRoot` — `GET /` →
  200 real index.html (`id="root"`), `GET /health` → 200.)_

## 8. Production fallback verification + dependency gate (F3)

- [x] 8.1 (verify) Using the 1.2 harness, assert the production fallback: `GET /` and a
  deep-link reload (`/<owner>/<repo>`) both return `index.html` (`200`), and `GET /api/...`
  unauthenticated → `401`. This discharges `page-routing`'s archive-gate obligation. _(e2e green:
  33 passed incl. `serve-web-spa.spec.ts`.)_
- [x] 8.2 (verify) Confirm page-routing's archive gate is mechanical:
  `openspec/changes/page-routing/dependencies.md` carries `depends-on: [serve-web-spa]`
  (the edge was added during this change's stage), and openspec tooling reports page-routing
  as archive-blocked until serve-web-spa archives. _(Verified: edge present; serve-web-spa active →
  the switch-openspec-archive dependency gate blocks page-routing until serve-web-spa archives.)_

## 9. Documentation

- [x] 9.1 `merge → docs/user/running-switchboard.md`: update the Docker-run + Access-model
  sections — the container serves the web app (load it on your phone), the `--docker`
  identity-trust default, the now-empty `identityAllowlist` default + the single step of
  adding your tailnet login, and the existing-config migration note. _(Added the "serves the web
  SPA" intro line, an "Admit your tailnet identity (one step)" subsection, and reworked the Access
  model note: public SPA vs gated `/api`, tokenless serve identity, empty-allowlist default.)_
- [x] 9.2 `merge → README.md`: note in "Running Switchboard" that the Docker image now
  serves the web UI over the tailnet (no longer API-only). _(Done — Docker-run note now says the
  image bundles + serves the web UI, tokenless via Tailscale identity.)_
- [ ] 9.3 (archive-time) `merge → docs/dev/Architecture/model.c4`: graduate
  `Planned/serve-web-spa.c4` — strip `#todo`, move the `spaStaticHost` component + the
  `Api -> WebSPA` edge into the permanent model (view into `views.c4` if kept), then delete
  the overlay file. _(Deferred to the `switch-openspec-archive` docs-migration step, per the ledger —
  executed during archive, not before; all other tasks are complete.)_
