# Design — serve-web-spa

## Context

The runtime image builds the whole workspace (`pnpm -r build` builds `apps/web` →
`apps/web/dist`) but the `pnpm deploy` step ships only the CLI tree; the web bundle is
discarded and the server (`apps/server/src/app.ts`) mounts only API routes behind
`app.use('*', authMiddleware)`. Over `tailscale serve`, a browser therefore gets API JSON
or 401/404 — no app. `page-routing` already records this as an unowned archive-gate
obligation (production must return `index.html` as a history fallback). The auth model is
**Tailscale identity** (decided in planning); `@hono/node-server@2.0.5` exports
`serveStatic` (verified), so no new dependency is needed.

## Goals / Non-Goals

**Goals**
- The container serves the built SPA so the phone loads the app over the tailnet.
- A **structural** public/gated boundary: a reserved `/api/*` gated namespace, everything
  else public SPA (Architecture-review F2).
- Same-origin, **tokenless** API access via serve identity — no secret in the browser.
- Fix the `identityAllowlist` default (F1) so default-on `--docker` trust is safe.
- Discharge `page-routing`'s production-fallback gate with a real verification (F3).

**Non-Goals**
- No change to the local `just run` dev path (Vite still serves the web app there).
- No new UI/screens — this serves the existing SPA.
- No external/public-internet exposure — tailnet only, unchanged.

## Decisions

### D1 — Reserved `/api/*` gated sub-app with a gated default-404

Restructure `createApp` so all protected routes live under a `/api` sub-app:

```
app.use('*', telemetry?) ; app.use('*', cors)
app.get('/health', …)                         // public liveness, at root (unchanged)
const api = new Hono<AppEnv>()
api.use('*', authMiddleware(ctx, ingress))     // reject-by-default WITHIN /api
api.post('/echo', …).post('/repos/clone', …)…  // the existing chained routes, verbatim
api.all('*', (c) => c.json({ error: 'not-found' }, 404))  // gated default — never falls to SPA
const routes = app.route('/api', api)          // AppType captures the /api-nested routes
// public static + SPA history fallback (only non-/api, non-/health paths reach here)
```

`app.route('/api', api)` keeps the chained-type inference the codebase relies on, so
`AppType` (and the `hc` client) gain an `.api` segment: `client.api.repos.cloned.$get()`.
`contract.ts` re-pins the shape; the web call sites and any server-side client move in
lockstep — drift fails `tsc`. The gated `api.all('*')` 404 means an unknown `/api` path is
rejected as API (401 unauth / 404 authed), never served the SPA — this is what makes the
boundary structural rather than a maintained prefix list.

### D2 — Static assets + `index.html` history fallback, public

After the `/api` route, serve the bundle from `ctx.webRoot` with
`serveStatic({ root: ctx.webRoot })` for real files, then a catch-all
`app.get('*', …)` that returns `index.html` (the SPA history fallback) for GET/HEAD.
These run **after** and **outside** the auth gate (which now lives only inside `/api`), so
the bundle is public — it carries no secrets. Non-GET requests outside `/api` get a 404.

### D3 — `RuntimeContext.webRoot?: string` gates SPA serving (additive, non-breaking)

Add an optional `webRoot` to `RuntimeContext`. When set, the server serves the SPA from
it; when **unset** (local `just run`, every existing unit/E2E harness), the server is
API-only exactly as today — so this change is additive and breaks no existing test. The
`--docker` bring-up sets `webRoot` to the bundled path in the image (convention: alongside
the deployed CLI, e.g. `/opt/switchboard/web`). If `webRoot` is set but `index.html` is
absent, SPA routes return a clear 503 (the API is unaffected) rather than crashing.

### D4 — SPA reaches its API same-origin and tokenless

`apps/web/src/api/config.ts`: when no `serverUrl` is injected, default it to
`window.location.origin` (never empty, so `hc` always has a valid base). The route paths
already carry `/api`, so calls resolve to `<origin>/api/*`. `apps/web/src/api/client.ts`:
omit the `Authorization` header when the token is empty (serve identity authorises). The
local `just run` path keeps precedence via injected `VITE_SERVER_URL` + `VITE_BEARER_TOKEN`
(bearer), so dev is unchanged.

### D5 — `identityAllowlist` defaults empty (F1)

Change `packages/shared/src/config.ts` `identityAllowlist` default from
`['nick-boey@github']` to `[]`, removing the baked-in personal identity. With an empty
allowlist the identity path admits nobody (403) — so default-on `--docker` trust is inert
until the operator adds their own login. Affects **fresh bootstraps only**; existing
`config.json` files keep their persisted value.

### D6 — `trustServeIdentity` defaults ON under `--docker`, as a FIRST-RUN default (F1, refined per Artifacts-review F-A1)

The shared schema stays mode-agnostic (`trustServeIdentity` default `false`). The `--docker`
bootstrap applies `trustServeIdentity: true` **only at first-run config creation** — it is
written into the newly created `config.json` (alongside the empty `identityAllowlist`). On
**loading an existing config** the persisted value is respected, and an existing config that
does not carry the field is read as the schema default (`false`) — the bootstrap never flips
trust on for an already-provisioned container.

This closes the upgrade hole F-A1 raised without a fragile value-based migration: a container
provisioned before this change (which may have the old baked-in allowlist persisted) is never
silently upgraded to admit it — its trust stays exactly as persisted (off, unless the
operator explicitly enabled it). A *fresh* `--docker` container gets trust on + an empty
allowlist (admits nobody until a login is added). Because of this, no clobbering migration of
persisted allowlist values is needed — existing allowlists are left untouched, and the
empty default applies only to new configs. The existing non-`--docker` fail-fast — reject
`trustServeIdentity` + a serve ingress unless the runtime asserts no host publication — is
preserved unchanged.

### D7 — Dockerfile bundles the web build

In the runtime stage, `COPY --from=builder /repo/apps/web/dist /opt/switchboard/web`
(the builder already produced it via `pnpm -r build`). No `.dockerignore` change needed
(it ignores `**/dist` only in the build *context*, not builder-stage outputs).

## Testing strategy

**Test-harness gap assessment.** Unit harnesses exist (Vitest against TS source for
shared/server/web; `makeTestContext`). The real gap is **production SPA serving**: today
the SPA's reload/deep-link fallback is only exercised under Vite (page-routing's E2E), not
against the built server. We need a harness that boots the server with `webRoot` pointing
at a fixture (or the built `apps/web/dist`) and asserts the fallback — this becomes the
leading "Test infrastructure" task group.

- **Server unit (`apps/server`)** — auth boundary is the priority:
  - every `/api/*` route rejects unauthenticated requests (401) on the direct ingress;
  - an unknown `/api/*` path is gated (401 unauth) and never returns the SPA;
  - non-`/api` GET returns `index.html` (200) with **no** auth; a real static asset is
    served; `/health` stays public;
  - serve ingress + identity markers + allowlisted login admits `/api/*`; empty allowlist
    → 403;
  - `webRoot` unset → server is API-only (no SPA routes); `webRoot` set but bundle missing
    → 503 on SPA routes, `/api` unaffected.
- **Web unit (`apps/web`)** — `readRuntimeConfig` defaults `serverUrl` to the page origin
  when nothing is injected; the client omits `Authorization` when the token is empty;
  injected env still wins.
- **Shared/CLI unit** — `identityAllowlist` defaults `[]`; a fresh `--docker` bootstrap
  yields `trustServeIdentity: true` + allowlist `[]` (admits nobody until set) and does
  not override an explicit user value; non-`--docker` still rejects trust + serve ingress.
- **Integration/E2E (Playwright)** — boot the **built** server with `webRoot` at the built
  web bundle; assert `GET /` and a deep link (`/<owner>/<repo>`) on reload both return
  `index.html` (the production fallback page-routing hands off), and `GET /api/...` unauth
  is 401. This is the verification that discharges page-routing's archive gate.
- **Docker** — extend the manual runtime check ("load the SPA on the phone"); plus a cheap
  image smoke (override entrypoint to run the server on the direct ingress and `curl /`
  for `index.html`) to catch a missing bundle in CI-free builds.

## Risks / Trade-offs

- **[Risk] The `/api` nesting ripples through `AppType` → contract + web call sites.**
  → Mitigation: `contract.ts` pins `AppType`, so any missed call site fails `tsc`; do the
  move mechanically and lean on the type-checker; route tests confirm behaviour.
- **[Risk] `hc` base / same-origin edge cases.** → Mitigation: always set `serverUrl` to
  `window.location.origin` (never empty); unit-test `readRuntimeConfig`.
- **[Risk] Static fallback shadows `/api` or `/health`.** → Mitigation: `/api` is fully
  consumed by the sub-app's gated catch-all; `/health` registered first; the SPA fallback
  matches only the remainder; asserted by tests.
- **[Risk] Default-on trust admits identity if the serve port is host-published.**
  → Mitigation: unchanged from `runtime-cli-docker` (the `--docker` no-host-publication
  contract); and the empty allowlist means nobody is admitted until the operator opts in.
- **[Risk] `webRoot` set but bundle absent.** → Mitigation: defined 503 behaviour, API
  unaffected; covered by a test.

## Migration Plan

- The `identityAllowlist` default change affects only **fresh** bootstraps; existing
  `config.json` files keep their persisted allowlist (the user's current container already
  has `nick-boey@github` persisted, so it keeps working — adopting the empty default is
  opt-in by clearing it). Documented in `docs/user/running-switchboard.md`.
- The `/api/*` move is internal (single-user app, no external API consumers); the typed
  client moves in lockstep.

## Open Questions

- Exact `webRoot` resolution in `--docker` — a fixed image path set by the bring-up vs an
  env var. Lean: the bring-up sets `ctx.webRoot` to the known image path.
- Whether `/health` ever moves under `/api`. Lean: no — keep it a public root liveness
  endpoint, unchanged.
