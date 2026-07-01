# Proposal — serve-web-spa

## Why

The Docker runtime image brings up the API behind `tailscale serve` but never bundles or
serves the web SPA, so a phone on the tailnet reaches only the API — there is no front
end. This is an unowned obligation `page-routing` already flagged (its archive gate) and
it blocks the product's core use: starting Claude sessions from your phone.

## What Changes

- The runtime image **bundles the built `apps/web` SPA** (`apps/web/dist`) alongside the
  deployed CLI.
- The API server **serves the SPA**: static assets by path + `index.html` as a **history
  fallback** for unknown non-`/api` GET paths (the clean-path requirement `page-routing`
  hands off). Served **publicly** (the bundle holds no secrets), ahead of the
  reject-by-default auth gate.
- **BREAKING (internal API surface):** all protected routes move under a reserved
  **`/api/*`** namespace. The auth gate applies to `/api/*` (reject-by-default *within*
  it); every non-`/api` path is the public SPA. This makes the public/gated boundary
  **structural** — a new API route can't escape the gate, and SPA clean paths can't
  collide with API prefixes. The typed `contract.ts`, the `hc` client, and the web
  client's API base move to `/api`.
- The served SPA authenticates API calls by **Tailscale serve identity**: same-origin and
  **tokenless** (no secret reaches the browser). The web client self-derives its
  same-origin `/api` base and omits the `Authorization` header when no token is
  configured; the local `just run` path keeps its injected URL + token (which take
  precedence).
- **`identityAllowlist` now defaults empty (`[]`)**, removing the baked-in
  `nick-boey@github` (a confirmed latent bug, `packages/shared/src/config.ts:102`).
  **BREAKING (config default):** affects fresh bootstraps only; existing `config.json`
  files keep their persisted allowlist.
- **`trustServeIdentity` defaults ON under `--docker`** — safe because the now-empty
  allowlist admits nobody (403) until the operator adds their tailnet login. Non-`--docker`
  runtimes still default trust off and still reject `trustServeIdentity` + a serve ingress
  at bootstrap.

## Capabilities

### New Capabilities

- **web-app-serving** — the API server serves the built SPA over the serve ingress:
  static assets by path + `index.html` history fallback for non-`/api` GET paths, served
  publicly (no auth), with a defined behaviour when the bundle is absent; the runtime
  image carries the bundle; and the served SPA reaches its API same-origin and tokenless.

### Modified Capabilities

- **api-auth-gate** — introduce the reserved `/api/*` gated namespace (reject-by-default
  within it) with all non-`/api` paths public; change `identityAllowlist` to default
  empty (remove the baked-in identity); default `trustServeIdentity` ON under `--docker`
  (the empty allowlist remains the real gate); preserve the non-`--docker` fail-fast
  rejection of `trustServeIdentity` + a serve ingress.
- **container-runtime** — the runtime image bundles `apps/web/dist` so the server can
  serve it.

## Impact

- **Code**: `apps/server` (route `/api/*` namespace move, static-serving + history
  fallback, auth-gate restructure), `apps/server/src/contract.ts` + `client.ts` (`/api`
  base), `apps/web/src/api/*` (same-origin/tokenless config), `packages/shared/src/config.ts`
  (allowlist default), `apps/cli` bootstrap (`--docker` trust default + first-run config
  tests), `Dockerfile` (bundle the web build).
- **APIs**: internal RPC paths move under `/api/*`. No external consumers (single-user
  app); the typed client moves in lockstep, so drift fails the build.
- **Dependencies**: **depends-on `runtime-cli-docker`** (modifies its `api-auth-gate` /
  `container-runtime` capabilities); satisfies `page-routing`'s archive gate
  (`page-routing` gains `depends-on: [serve-web-spa]`).
- **Security posture**: the container path shifts to "trust on, allowlist closed"; the
  static bundle is public; no token in the browser.
- **Docs**: `docs/user/running-switchboard.md`, `README.md`, and the architecture model
  (graduate `docs/dev/Architecture/Planned/serve-web-spa.c4`).
