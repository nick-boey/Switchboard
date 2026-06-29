---
title: 'Plan: Branches & PR indicators'
openspec-changes:
  - branches-control-panel
  - pr-indicators
---

# Plan: Branches & PR indicators

> Programme page coordinating GitHub issue #22 ("Add branches tab"). It is the **arbiter of
> consistency** across the two changes below: any decision that affects more than one change is
> recorded here, not in a single change's artifacts.
>
> `openspec-changes` (frontmatter) lists changes as created and drops them once archived. Each
> change's `plan.md` links back here (bidirectional). This page is **trimmed** when
> `branches-control-panel` archives (Phase-1 detail removed) and **retired** when
> `pr-indicators` archives (content migrates to permanent docs).

## Problem

The repositories home lists only **worktrees** per repository. A user cannot see branches
without a worktree, cannot tell how a branch relates to its remote or whether it has a PR, and
cannot filter or search the home page. Issue #22 asks for a **control panel** (search + filter
toggles) and **branch / PR indicator lights**, with the ability to start a worktree directly
from a branch.

## The phased split & why

An adversarial architecture review (stage-1 checkpoint) surfaced two CRITICAL git-layer
findings and a cluster of GitHub-overlay risks. The two concerns are separable, and the
git-only half ships value with zero GitHub-API risk, so the work is split:

| Phase | Change | Scope |
|---|---|---|
| 1 | [`branches-control-panel`](../../../openspec/changes/branches-control-panel/plan.md) | Control panel (search + Worktrees/Local/Remote toggles), branch enumeration (local+remote) + the 6-state **branch** lamp, dashed-plug **create→launch** via a server-owned endpoint. Git only. |
| 2 | [`pr-indicators`](../../../openspec/changes/pr-indicators/plan.md) | The **PR** indicator light (data + states), the 4th **"PR exists"** toggle, and the GitHub GraphQL read path. Depends on Phase 1. |

**Ordering:** `pr-indicators` **depends-on** `branches-control-panel` (recorded in
`pr-indicators`'s `dependencies.md` when that artifact is created). Rationale: Phase 1 proves
the risky branch-enumeration plumbing first and lays the contract seams Phase 2 fills.

## Shared contract seams (Phase 1 lays, Phase 2 fills)

1. **Branch summary contract** (`packages/shared`): Phase 1 defines the branch summary and a
   `branchStatus` enum (six states). It **reserves an optional `prStatus` field**; Phase 1
   never populates it, Phase 2 does. Adding `prStatus` later must be a non-breaking optional.
2. **PR lamp** stays **display-only** in Phase 1 (unchanged from today). Phase 2 wires its
   data and defines its state mapping (below).
3. **Control panel** ships in Phase 1 with three toggles; Phase 2 adds the **"PR exists"**
   toggle and its URL search-param key, reusing the Phase-1 multi-toggle component and the
   `validateSearch` schema on both home routes.
4. **Branch row layout** (Phase 1) leaves a slot for the PR lamp so Phase 2 is data + wiring,
   not a re-layout.

## Phase 2 decisions (PR overlay) — recorded here because they bind the shared seams

These were agreed during the Phase-1 interview and are carried forward so Phase 2 honours
them. They become `pr-indicators`' own delta specs / design.

- **PR indicator — four states** (open PR only), evaluated top-down so the worst signal wins,
  with an explicit **pending/unknown** state so it is **total** over GitHub's enums:

  | Order | Condition | Tone |
  |---|---|---|
  | 0 | overlay unresolved / rate-limited / `mergeable: UNKNOWN` / rollup `null`/`PENDING` | **unknown** (distinct affordance, e.g. dim/spinner) |
  | 1 | status-check rollup `FAILURE`/`ERROR` | red |
  | 2 | `mergeable: CONFLICTING` | yellow |
  | 3 | mergeable + checks pass + not draft + `reviewDecision == APPROVED` | green |
  | 4 | otherwise (PR exists) | blue |

  "Ready to merge" (green) **requires an approving review** (review decision APPROVED).
- **`unknown` ≠ `none`** (review M2): a resolved "no open PR" shows no PR lamp; an unresolved/
  rate-limited overlay shows the distinct `unknown` affordance — never the same neutral as "no
  PR", so a rate-limited GitHub can't read as "this branch has no PR".
- **Multi-PR per branch / fork collisions** (review M2): a branch may have several open PRs and
  fork PRs can collide on `headRefName`; tie-break **worst-signal-wins** using the order above,
  scoped to PRs whose head repo is this repo.

## Deferred review findings — Phase 2 obligations

Carried from the Architecture checkpoint so they are not lost:

- **H1 — GraphQL fractures the no-leak REST provider contract.** GraphQL returns HTTP 200 with
  errors *in the body* and a *points-based* rate budget reported in the body — incompatible
  with the REST provider's status-code-only, never-read-the-body model. Phase 2 builds a
  **distinct GraphQL provider** (`pullRequestService`) that maps body-level errors + the rate
  budget into the existing typed `GitHubError` kinds **without surfacing messages**; the
  no-leak handling is a named security task, not assumed reuse.
- **H2 — Rate budget on the aggregated home page.** The home page renders *every* cloned repo
  at once; one PR query per repo, polled, will exhaust the GraphQL budget. Phase 2 makes the
  overlay **lazy / viewport-bounded, cached, batched (GraphQL aliases), long-interval**, and
  decides the cadence *before its proposal* — it is load-bearing, not a tuning detail.
- **H3 — async `mergeable`/`statusCheckRollup`.** Handled by the **unknown** row above; Phase 2
  must not conflate `UNKNOWN` with `CONFLICTING`.
- **M2 — join ambiguity + unknown-vs-none.** Handled by the multi-PR tie-break and the
  `unknown ≠ none` rule above.

## Planned architecture

- Phase 1: `docs/dev/Architecture/Planned/branches-control-panel.c4` — adds
  `Switchboard.Api.branchService` (+ git/worktree/credential/fetch edges), view
  `branches-control-panel-api`.
- Phase 2: `docs/dev/Architecture/Planned/pr-indicators.c4` — adds
  `Switchboard.Api.pullRequestService` (distinct GraphQL provider) + its `-> GitHub` PR-read
  edge (realising the read side of the base `Api -> GitHub` `#planned` "pull requests" edge),
  view `pr-indicators-api`.

Both validated together: `✓ Valid (6 files)`.

## Open questions

See each change's `plan.md` Open questions. Programme-level: whether the control-panel /
branch-filtering behaviour is its own capability or folds into `repos-home` (decide at Phase 1
specs), and multi-remote / `gone`-upstream support (likely a later change, not either phase).
