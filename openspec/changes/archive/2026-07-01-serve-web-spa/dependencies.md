---
depends-on:
  - runtime-cli-docker
---

## Why `runtime-cli-docker`

This change **modifies capabilities that `runtime-cli-docker` owns** and has not yet
merged into the main specs (it is complete but unarchived):

- `api-auth-gate` — serve-web-spa adds the reserved `/api/*` gated namespace, makes the
  static/SPA paths public, changes the `identityAllowlist` default to empty, and defaults
  `trustServeIdentity` ON under `--docker`. These are deltas on the auth-gate behaviour
  `runtime-cli-docker` established.
- `container-runtime` — serve-web-spa bundles `apps/web/dist` into the runtime image
  `runtime-cli-docker` defined.

Implementation may begin once `runtime-cli-docker`'s tasks are all complete (they are);
**archiving** serve-web-spa requires `runtime-cli-docker` archived first, so its specs
merge before these deltas apply on top.

## Relationship to `page-routing` (reverse edge — not a depends-on here)

serve-web-spa **discharges** the production-SPA-fallback obligation that
`page-routing/dependencies.md` records as an archive gate ("when a server serves the built
SPA in production it must return `index.html` as a history fallback for unknown non-API
paths"). Per Architecture-review finding F3 (and Artifacts-review F-A2), this is now
mechanical: **`page-routing` carries `depends-on: [serve-web-spa]`** (edge added during this
change's stage), so `page-routing` cannot archive until serve-web-spa's fallback ships and
is verified. That edge lives in `page-routing`'s `dependencies.md`, not here (it is
`page-routing` that depends on this change, not the reverse).

## Capability-overlap check

- `runtime-cli-docker` carries delta specs for `api-auth-gate`, `app-runtime`,
  `cli-runtime`, `container-runtime`; serve-web-spa overlaps on `api-auth-gate` and
  `container-runtime` — ordered by the `depends-on` above.
- `page-routing` carries only `web-navigation`; serve-web-spa introduces the new
  `web-app-serving` capability (server-side SPA delivery) — no spec overlap, only the
  archive-gate handoff above.
