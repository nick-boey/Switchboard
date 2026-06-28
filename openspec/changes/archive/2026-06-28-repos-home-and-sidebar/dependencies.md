---
depends-on: []
---

No dependencies. This change is a self-contained `apps/web` presentation/navigation
restructure introducing the new `repos-home` capability. The only other active change,
`runtime-cli-docker`, carries delta specs for `api-auth-gate` / `app-runtime` /
`cli-runtime` / `container-runtime` — no capability overlap with `repos-home`, and no
ordering constraint between the two.
