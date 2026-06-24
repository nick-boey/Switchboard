---
depends-on:
  - claude-session-launch
---

`runtime-cli-docker`'s only **hard technical** dependency is `foundations` (archived — the
server/bind/auth/`RuntimeContext` shape it productionizes), which is already satisfied. It is
nonetheless **sequenced after the feature chain**: the programme page places it last so there
is a complete, working app to ship and so the Docker/Tailscale runtime is validated against
real clone/worktree/session behaviour (programme page,
[Change roadmap](../../../docs/plans/switchboard/mvp.md#change-roadmap)). That ordering is
encoded as a `depends-on` on `claude-session-launch` (the last feature change), which
transitively covers `worktree-management`, `repo-clone-browse`, and `ui-prototypes-mvp`.

> If the runtime work needs to start earlier (it only truly needs the archived
> `foundations`), relax this edge — it is a sequencing choice, not a code dependency.

**Capability overlap:** `cli-runtime` / `container-runtime` are new. This change **modifies**
the existing `api-auth-gate` (serve-exclusive ingress → a dedicated loopback serve port) and
`app-runtime` (config
bootstrap / supervised lifecycle) capabilities; no other active change touches those, so
there is no contended delta. The programme page is the shared arbiter.
