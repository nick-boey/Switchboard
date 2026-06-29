---
depends-on: []
---

No OpenSpec dependencies.

Capability-overlap scan: the active changes `page-routing` (web-navigation, api-auth-gate) and
`runtime-cli-docker` (app-runtime, cli-runtime, container-runtime) carry no delta specs for
`session-launch`, `session-list`, or `session-web-link`, so there is no ordering constraint and no
shared plan page is required.

Not a dependency (recorded for context, not as an edge): the local `name-sessions` branch edits the
same Claude launch argv (`-n/--name`) that this change touches (`--session-id`). It is **not** an
active OpenSpec change in this repo, so it cannot be a `depends-on` target and does not gate
implementation. The conflict is absorbed in-code by a shared, composable launch-argv builder plus a
test asserting the flags compose (plan.md Decision 10); whichever branch merges first, the other
rebases against the builder.
