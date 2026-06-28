# Documentation migration: repos-home-and-sidebar

No documentation impact — the SPA's screen/navigation behaviour is captured by the new
`repos-home` capability spec (merged into `openspec/specs/repos-home/` at archive), which is
this repo's durable record for UI behaviour alongside Storybook; there is no permanent
`docs/dev` web-UI/navigation page to author or update. The LikeC4 model is opaque at the
`Switchboard.WebSPA` boundary and unchanged by this presentation/navigation restructure, and
an internal navigation change has no `docs/user` impact. This change's `plan.md` links no
Plans page, so no Plans-page retire/trim row applies (the broader
`docs/plans/switchboard/mvp.md` is owned by other changes and is not this change's to
migrate).

<!-- Supersedes plan.md's seeded "author/refresh dev notes" decision: investigation at design
     time found no existing dev web-UI doc to refresh and confirmed the project documents UI
     behaviour via specs + Storybook rather than docs/dev prose. -->
