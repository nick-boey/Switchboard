# Plan — serve-web-spa

## Problem

The Docker runtime image brings up the API server behind `tailscale serve`, but it
**never bundles or serves the web SPA**. `runtime-cli-docker`'s `plan.md` claims it
"serves the SPA on the tailnet," yet its specs/tasks define no static-SPA-serving or
`index.html` history-fallback, and `apps/server/src/app.ts` exposes only API routes.
`page-routing/dependencies.md` (verified 2026-06-28) records this exact gap as an
unowned obligation and an **archive gate** on `page-routing`.

Concretely: a phone on the tailnet that opens `https://<host>.ts.net/` today gets a
bare API. After the `trustServeIdentity` flip it would still 404 on `/` — there is no
front end. The user's goal is to **load the actual Switchboard app on their phone**.

## Architecture summary

The `Switchboard.Api` container gains a **SPA Static Host** responsibility: it serves
the built `apps/web` bundle from the runtime image — static assets by path, and
`index.html` as a **history fallback** for unknown non-API GET paths (the clean-path
requirement `page-routing` hands off). The bundle is served **publicly**, ahead of the
reject-by-default auth gate (it carries no secrets); the API routes stay gated. The two
coexist at one origin via a **structural reserved `/api/*` namespace** — everything under
`/api` is gated reject-by-default, everything else is the public SPA, so new API routes
can't escape the gate and clean paths never collide (see decision 4).

The phone loads the SPA from `https://<host>.ts.net/` and the SPA makes **same-origin,
tokenless** API calls; those re-enter through `tailscale serve`, which injects the
identity markers, and the serve ingress admits them by **Tailscale identity** (the
auth model decided with the user). No secret ever reaches the browser.

The runtime image (the `container-runtime` capability) bundles `apps/web/dist`
alongside the deployed CLI; the server (`app-runtime`) locates and serves it.

```
Phone browser (tailnet)
   │ HTTPS :443
   ▼ tailscale serve  ── injects tailscale-user-login / headers-info / CGNAT x-forwarded-for
   ▼ http://127.0.0.1:<servePort>   (serve ingress; identity-eligible when trust on)
┌──────────────── Switchboard.Api ────────────────┐
│ GET /, /assets/*, /<owner>/<repo> → PUBLIC SPA   │  static + index.html fallback (no auth)
│ /api/*  (echo, repos, worktrees, sessions) → GATE│  Tailscale identity (allowlist) | bearer
└──────────────────────────────────────────────────┘
   ▲ SPA same-origin API calls re-enter via serve → identity headers → admitted
```

## Plan page

None — this `plan.md` is the complete plan. Single-change, no multi-change programme to
arbitrate.

## Planned architecture

`docs/dev/Architecture/Planned/serve-web-spa.c4` (validated: `✓ Valid (5 files)`):

- **Element** `Switchboard.Api.spaStaticHost` — component "SPA Static Host" (`#todo`).
- **Relationship** `Switchboard.Api -> Switchboard.WebSPA` — "Serves the built SPA
  bundle … over the Tailscale serve ingress — public; API routes stay gated" (`#todo`).
- **View** `serve-web-spa-delivery`.

At archive: strip `#todo`, graduate the component + edge into `docs/dev/Architecture/model.c4`
(and the view into `views.c4` if kept), then delete this overlay file.

## Decisions

1. **Auth model = Tailscale identity** (decided with user). The SPA calls the API
   same-origin with **no token**; serve identity authorises. No secret in the browser.
   The web client change is minimal: self-derive `serverUrl` from the page origin when
   nothing is injected (the local `just run` path keeps its injected `VITE_SERVER_URL` +
   token, which take precedence), and omit the `Authorization` header when the token is
   empty.
2. **`trustServeIdentity` defaults ON in `--docker` — but ONLY after fixing the allowlist
   default** (decided with user; revised per Architecture review **F1**). **Prerequisite
   (confirmed latent bug):** `packages/shared/src/config.ts:102` defaults
   `identityAllowlist` to `['nick-boey@github']` — a baked-in personal identity. This change
   MUST first make that default **empty (`[]`)**. With an empty allowlist, default-on trust
   is **inert** (identity admits nobody → 403) until the operator adds their own tailnet
   login — that emptiness IS the conditionality the safety argument needs. The change only
   affects **fresh bootstraps**; existing `config.json` files keep their persisted allowlist.
   The direct loopback ingress stays bearer-only regardless, and the bootstrap mode-aware
   validation must still reject `trustServeIdentity` + serve ingress on a non-`--docker`
   runtime. This expands scope into the `api-auth-gate` / shared-config capability and
   requires **first-run `--docker` config tests** (a fresh container admits nobody until the
   allowlist is set). Net posture: "trust defaults off" → "trust defaults on in the
   container, allowlist defaults closed."
3. **Static bundle is public; API stays gated.** Static assets + the `index.html`
   fallback are served ahead of the auth gate (no secrets in the bundle); the auth gate
   covers only the API namespace (see decision 4), never the SPA paths.
4. **API/SPA boundary is STRUCTURAL, not a maintained prefix list** (revised per
   Architecture review **F2**). All protected routes move under a single reserved
   **`/api/*`** namespace; the auth gate applies to `/api/*` (reject-by-default *within*
   the namespace), and the SPA serves every non-`/api` path publicly (static +
   `index.html` fallback). This makes the boundary mechanical — a new API route is
   auto-gated by living under `/api`, and the owner-name collision disappears entirely
   (clean paths `/`, `/new-repo`, `/<owner>/<repo>` never overlap `/api`). Cost: a
   mechanical refactor of the route definitions, the typed contract + `hc` client base,
   the web client's API base, and tests. (Alternative considered — a gated API sub-app
   with a gated default-404 ahead of the SPA fallback — keeps routes at root but still
   risks root collisions; rejected for the cleaner namespace.) Tests must prove every
   `/api` route rejects unauthenticated requests and the SPA fallback fires only for
   non-`/api` GET/HEAD.
5. **Dependency gates are mechanical, not deferred** (revised per Architecture review
   **F3**). Firm: `serve-web-spa` **depends-on `runtime-cli-docker`** (recorded in this
   change's `dependencies.md` when that artifact opens). `page-routing` gains
   **`depends-on: [serve-web-spa]`** — its frontmatter is edited from `[]` once this
   change's specs lock scope — making page-routing's existing archive gate enforceable.
   The production `index.html` history fallback gets an **explicit verification task/spec**
   in this change (not just an assertion), discharging the obligation page-routing hands off.

**Documentation destinations** (seed for `docs-migration.md`):
- `docs/user/running-switchboard.md` — **update**: the Docker run now serves the web app;
  document loading the SPA on the phone, the `--docker` trust default, and the
  `identityAllowlist` step. The local `just run` story is unchanged.
- `docs/dev/Architecture/Planned/serve-web-spa.c4` — **graduate then delete** into the
  permanent model at archive.
- `README.md` "Running Switchboard" — small note that the container now serves the UI.

## Open questions (for design)

- **Where the web bundle lives in the image and how the server finds it** — convention
  (e.g. `/opt/switchboard/web` resolved relative to the CLI) vs config/env. Lean:
  convention, overridable, with a clear "bundle missing" behaviour.
- **Config delivery mechanism** — SPA self-derives same-origin (no server-side HTML
  templating) vs server injects `window.__SWITCHBOARD_CONFIG__`. Lean: self-derive
  (simpler server; `index.html` served byte-for-byte). Verify `hc('')` / origin handling.
- **Exact Hono mechanism** for the `/api/*` gated namespace + the public static/SPA
  fallback (a gated `/api` sub-app mounted ahead of `serveStatic` + an `index.html`
  fallback handler), and how `/health` is exposed (stay public at root vs `/api/health`).
- **Config delivery follow-through** — confirm the SPA can self-derive its same-origin
  `/api` base (verify `hc` base handling) so no server-side `index.html` templating is
  needed.
- **Does this change touch the local non-container serve path** at all, or stay
  container-only? Lean: server-side serving is host-agnostic (works for any `node dist`
  + bundled web), but scope the *tasks* to the container goal.
