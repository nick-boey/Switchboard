# Plan: pr-indicators

<!-- Created during the planning interview (/switch-plan). The durable record of why this
     change exists and what architectural shape was agreed. -->

**Phase 2** of the branches programme for GitHub issue #22. Depends on
`branches-control-panel` (Phase 1). The shared plan page is the arbiter of consistency for the
cross-phase contract seams and the PR-overlay decisions; this plan.md does not duplicate them.

## Problem

Phase 1 reframes the home page around branches but leaves the **PR indicator light
display-only** — it carries no data, and there is no way to filter the home page by "has a
pull request". A user still cannot tell, at a glance, whether a branch has an open PR or what
state it is in (checks failing, merge conflict, ready to merge).

This change gives the PR indicator real data, adds the **"PR exists"** filter toggle (the 4th
toggle, completing issue #22), and builds the GitHub read path behind it.

## Architecture summary

One server-side addition inside **`Switchboard.Api`**: a new **`pullRequestService`**
component that reads open pull requests per repository over the GitHub **GraphQL** API. It is
a **distinct provider** from the REST `githubService` on purpose — the review found GraphQL
returns HTTP 200 with errors in the body and a points-based rate budget reported in the body,
which the REST provider's status-code-only, never-read-the-body **no-leak** model cannot
represent. `pullRequestService` maps body-level errors and the rate budget into the existing
typed `GitHubError` kinds **without surfacing messages**, preserving the no-leak property
explicitly. It realises the read side of the base model's `#planned`
`Switchboard.Api -> GitHub 'reads/writes pull requests'` edge.

The web slice fills the **PR lamp** (already laid out by Phase 1) from an **async PR overlay**
query, adds the **"PR exists"** toggle to the Phase-1 control panel (reusing its multi-toggle
component + `validateSearch` schema), and populates the optional `prStatus` field Phase 1
reserved on the branch summary contract. The overlay is **lazy / viewport-bounded, cached,
batched, long-interval** (review H2) and degrades to a distinct **unknown** state (review H3,
M2) — never readable as "no PR".

See the plan page for the full PR state mapping, the unknown-vs-none rule, multi-PR
tie-breaking, and the deferred review findings (H1–H3, M2) this change must honour.

## Plan page

`docs/plans/switchboard/branches-and-pr-indicators.md` — the programme arbiter. Its
`openspec-changes` frontmatter lists this change and `branches-control-panel`. The PR-overlay
decisions and the deferred findings are recorded there because they bind the shared Phase-1
seams.

## Planned architecture

File: `docs/dev/Architecture/Planned/pr-indicators.c4` (validated with the Phase-1 overlay:
`✓ Valid (6 files)`).

Elements added:

- `Switchboard.Api.pullRequestService` (component, `#todo`)

Relationships added (all `#todo`):

- `Switchboard.Api.pullRequestService -> GitHub` (PR/checks/mergeable/review read, GraphQL)

Views added:

- `pr-indicators-api` (of `Switchboard.Api`)

At archive, `pullRequestService` and its edge graduate into `model.c4`, the view into
`views.c4`, this overlay is deleted, and the shared plan page is retired.

## Decisions

1. **Depends on `branches-control-panel`.** Implementation cannot start until Phase 1's tasks
   are complete; archiving requires Phase 1 fully archived (its specs merged first). Recorded
   in `dependencies.md` (`depends-on: [branches-control-panel]`) when that artifact is created.

2. **Distinct GraphQL provider, no-leak preserved explicitly** (review H1) — not an extension
   of the REST `githubService`. The body-error / rate-budget translation into typed
   `GitHubError` kinds is a named security task.

3. **Lazy, bounded, batched, cached PR overlay** (review H2) — cadence decided before the
   proposal; it is load-bearing on the aggregated home page.

4. **PR state mapping is total** over GitHub's enums with an explicit **unknown/pending**
   state distinct from both "conflict" and "no PR" (review H3, M2). Full table on the plan
   page; "ready" (green) requires an approving review.

5. **Reuse Phase-1 seams**: populate the reserved optional `prStatus` field; reuse the
   multi-toggle control + `validateSearch`; the PR lamp slot already exists in the branch row.

6. **Documentation destinations** (seed for `docs-migration.md`):
   - *Update* `docs/user/running-switchboard.md` — the PR indicator + the "PR exists" toggle.
   - *Graduate* `Planned/pr-indicators.c4` into `model.c4` + `views.c4`, then delete it.
   - *Retire* the shared plan page (its content migrates to permanent docs at this archive).
   - Delta specs touch `github-repos` (PR reads) and `repos-home` (the PR toggle/indicator).

## Open questions

1. **GraphQL query shape & batching** — single query with per-repo aliases vs per-repo query;
   the exact field selection (`statusCheckRollup`, `mergeable`, `reviewDecision`, `isDraft`)
   and pagination assumption (first ~100 open PRs/repo). Settle in design.

2. **PAT scope** — behaviour when the PAT lacks checks/PR read scope: surface as the `unknown`
   state with a one-time hint, or a typed error. Decide in design.

3. **Overlay cadence numbers** — concrete interval + cache TTL for the bounded overlay
   (review H2). Tune in design.
