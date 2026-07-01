---
depends-on:
  - serve-web-spa
---

## Why `serve-web-spa`

This change is a self-contained, web-only slice that is fully implementable and verifiable
**today** under the Vite serving path (dev + `vite preview`, both of which provide a
history-API fallback for clean paths). Its only cross-change tie is the
**production-fallback archive gate**: clean browser-history deep links (`/<owner>/<repo>`,
`/new-repo`) must survive a reload in production, which requires that whoever serves the
*built* SPA returns `index.html` as a history fallback for unknown non-`/api` paths —
otherwise those paths 404 in production even though they pass under Vite.

That production SPA host is owned by **`serve-web-spa`** (static asset serving +
`index.html` history fallback over the Tailscale serve ingress, with its own verification).
`page-routing` therefore carries **`depends-on: [serve-web-spa]`** above. The edge gates
**archive, not implementation**: page-routing ships and is fully verifiable now under Vite,
but it cannot archive until `serve-web-spa` archives — at which point the production fallback
exists and has been verified.

> **History:** the original plan expected `runtime-cli-docker` to add production SPA serving,
> but that change shipped API-only with no static-serving / history-fallback spec or task. The
> obligation was therefore moved to the dedicated `serve-web-spa` change, and this dependency
> was re-pointed from `runtime-cli-docker` to `serve-web-spa` accordingly.

## Archive condition

`page-routing` MUST NOT archive until `serve-web-spa` is archived. This single condition
matches the `depends-on: [serve-web-spa]` edge above and is mechanical — standard dependency
tooling reports page-routing as archive-blocked until serve-web-spa archives. The discharge
is verified by `serve-web-spa`'s own production-fallback tasks (`GET /` and a deep-link reload
both return `index.html`; `GET /api/...` unauthenticated → `401`), so page-routing does not
re-verify the fallback itself.

## Capability-overlap check

No spec overlap. `serve-web-spa` introduces the new `web-app-serving` capability (server-side
SPA delivery) and modifies `api-auth-gate` / `container-runtime`; page-routing carries only
`web-navigation`. The sole tie between them is the archive-gate handoff above.
