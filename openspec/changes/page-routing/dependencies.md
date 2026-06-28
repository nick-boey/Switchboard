---
depends-on: []
---

No blocking dependencies. This change is a self-contained, web-only slice that works under
the current Vite serving path (dev + `vite preview`, both of which provide history-API
fallback for clean paths).

Relationship to `runtime-cli-docker` (the other active change) is a **constraint, not a
dependency**: clean browser-history paths require that whoever serves the *built* SPA in
production returns `index.html` as a history fallback for unknown paths, and production
serving is owned by `runtime-cli-docker`. Neither change blocks the other — page-routing
ships and is fully verifiable today under Vite (dev + `preview`, which both provide the
fallback) — so this is intentionally **not** listed in `depends-on`. The requirement is
captured as a `web-navigation` spec scenario ("a page survives a reload") rather than as an
ordering constraint.

**Archive-gating obligation on `runtime-cli-docker`** (Codex Artifacts-review findings ② and,
re-raised, the high finding on the re-planned artifacts): when a server serves the built SPA in
production it **must** return `index.html` as a history fallback for unknown non-API paths, or
deep-linked / reloaded clean paths (`/<owner>/<repo>`, `/new-repo`) will 404 in production even
though they pass under Vite dev/preview.

**Current state (verified 2026-06-28):** `runtime-cli-docker`'s `plan.md` states it "serves the
SPA on the tailnet," but its specs and tasks (`app-runtime`, `cli-runtime`, `container-runtime`,
`api-auth-gate`) define **no** static-SPA-serving or `index.html`-history-fallback requirement
or task — and `apps/server/src/app.ts` exposes only API routes. So the obligation page-routing
hands off is **not yet specced or owned anywhere**, and production reload/deep-link support is
currently **unmet**.

**Resolution (decided 2026-06-28):** keep this change **un-blocked for implementation** — its
`web-navigation` behaviour is fully implementable and verifiable today under Vite, whose dev +
`preview` paths both provide the history fallback (the spec's load/reload requirement now states
this dependence on the serving host explicitly). But the obligation is escalated from a soft
"forward constraint" to an **explicit archive gate** (`tasks.md` 6.2): page-routing MUST NOT
archive until the production SPA host provides + verifies the fallback. The follow-up on the
`runtime-cli-docker` side — adding a SPA-static-serving + history-fallback spec/task to *that*
change — is that change's work (do it in its stage, not here); once its scope is confirmed to
cover it, add the `depends-on: [runtime-cli-docker]` edge above so the gate is mechanical.

No capability overlap: `runtime-cli-docker` carries delta specs for `api-auth-gate`,
`app-runtime`, `cli-runtime`, and `container-runtime`; this change introduces only
`web-navigation`.
