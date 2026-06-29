## Context

Today the home (`ReposHome` → `Worktrees`/`WorktreesView`) lists only worktrees per repository.
This change (Phase 1 of issue #22) reframes the home around the **branch** and adds a control panel.
The stage-1 architecture review established two hard git-layer facts: a bare clone configures **no**
`remote.origin.fetch` refspec (so `refs/remotes/origin/*` is empty until a worktree is created —
review C1), and `%(upstream:track)` is empty on a bare clone's local heads (so it cannot derive the
six states alone — review C2). The visual building blocks already exist; the prototypes proved out
the dim/flashing-purple lamp, the independent multi-toggle, and the dashed plug.

The Artifacts checkpoint surfaced that the prior design under-specified three things against the
real code: the compound op's ledger key vs the existing key schemes; the impact of swapping the
section's data query; and that `gitService` has no ref/fetch surface today while `worktreeService`
already has a `fetchOrigin`. The decisions below resolve all three.

Constraints (CLAUDE.md): vertical-slice; TanStack Query for server state; the typed Hono RPC client;
the `apps/server` no-leak telemetry rule (the redactor masks by **key name** via `KEY_BLOCKLIST`,
which already contains `/branch/i`); the merged `page-routing` TanStack Router code-based tree.

## Goals / Non-Goals

**Goals:**

- A server `branch-listing` capability: enumerate local + remote branches with the six-state status,
  via a `gitService` extended to own ref-enumeration + a best-effort repo-wide fetch.
- A home control panel (search + Worktrees/Local/Remote switches, union, default worktrees-only,
  URL-search-param state) that filters branch rows.
- The six-state branch indicator on every branch row (replacing the git lamp), and the dashed plug
  that runs a **server-owned** create-worktree-then-launch operation.

**Non-Goals:**

- Anything PR / GitHub (the PR lamp data, the "PR exists" toggle, GraphQL) — the dependent
  `pr-indicators` change. Phase 1 only *reserves* the optional `prStatus` field.
- Multi-remote support, a distinct "upstream gone" state, list virtualization (open questions).
- Retiring `worktreeService.list` or the `['worktrees']` flows wholesale — see Decision 9.

## Decisions

1. **`gitService` gains ref-enumeration + a best-effort repo-wide fetch** (review H1, C1, C2). It is
   the natural owner of git plumbing. New surface: enumerate `refs/heads/*` and
   `refs/remotes/origin/*` (with object names), and a `fetchAll(repoId)` that ensures the
   `+refs/heads/*:refs/remotes/origin/*` refspec then runs `git fetch --quiet origin` best-effort
   (PAT via the existing credential-helper edge). `worktreeService.fetchOrigin` is **refactored to
   call this shared capability** so there is one fetch/refspec implementation, not two. `branchService`
   depends on `gitService` for both reads and the fetch — it never shells git itself. (`.c4` updated:
   the `branchService -> GitHub`/`-> credentialHelper` edges are dropped; `gitService -> GitHub`
   gains the fetch responsibility.)

2. **Branch-status derivation: ref-namespace join + commit comparison, not `%(upstream:track)`**
   (review C2). `branchService` joins the two ref namespaces on short branch name and classifies:
   local-only / remote-only by presence; for present-both compare tips
   (`merge-base`/`rev-list --left-right --count`) → `synced` / `ahead` / `remote-ahead` / `diverged`.
   A `gone` upstream → `local-only` (Phase 1). Cost bound: where a local branch *does* have a
   configured upstream, read ahead/behind cheaply; fall to per-pair `merge-base` only otherwise.

3. **Shared contracts; the branch list is the section's single source** (review C2). `branchStatus`
   is a six-state `z.enum`. `branchSummarySchema = { name, status, hasWorktree, wtId?, dirty?, path?,
   prStatus? }`, where `wtId`/`dirty`/`path` are present **iff** `hasWorktree` (so the row, the
   delete safe-predicate's dirty input, and session wiring all read from the branch list), and
   `prStatus` is **optional and unused in Phase 1** (reserved for `pr-indicators`).
   `branchListResponseSchema = { branches, stale: boolean }` (the remote-fetch freshness flag).

4. **Server-owned compound op with a distinct ledger key** (review C1, H5). A new `launch-from-branch`
   ledger **operation type** keyed `launch/<repo-id>/<wt-id>` — a **third namespace**, distinct from
   the worktree key `<repo-id>/<wt-id>` and the session key `session/<repo-id>/<wt-id>`. It drives the
   existing inner ops in sequence: `worktreeService.create` (which runs its own `<repo-id>/<wt-id>`
   worktree op, including its branch-equality collision check) → await ready → `sessionService.launch`
   (its own `session/...` op). Idempotency: a second activation of the same `launch/...` key returns
   the in-flight compound op; a worktree-create branch collision surfaces through unchanged; a direct
   worktree-create or session-launch for the same `<wt-id>` arriving concurrently reconciles via its
   own key (idempotent), never aliased onto the compound op. Partial failure: create-fail launches
   nothing; launch-fail-after-create leaves the worktree present with a typed launch error (retry via
   the existing session-launch).

5. **Control panel = new production component, promoted from the prototype** (`control-panel`
   prototype; review H4 — `SegmentedToggle` is single-select). Port `FilterToggleGroup` + `SearchField`
   + `ControlPanel`; render once atop `ReposHome`.

6. **Filter state in URL search params** (review M3-routing): a shared `validateSearch` schema on
   **both** `/` and `/$owner/$repo`; default (only Worktrees) = the empty search (no params) so
   sidebar `<Link>`s don't churn state. Verify against page-routing's Playwright suite.

7. **Branch lamp: extend the production `Lamp`** with two new purple variants and a `BranchLamp`
   (`branch-lamp` prototype; review M1, L1, L2). The two branch purples get **their own theme token**
   (e.g. `--sb-branch-remote`), distinct from the PR lamp's `--sb-pr-merged`, so a branch row's purple
   indicator is not confused with the (display-only) PR lamp's merged purple. `BranchLamp` **replaces
   `GitLamp`** on every branch row; `GitLamp`/`GitStatus` are **removed** (their only consumer is the
   worktree row), while `worktreeSync` stays as an internal git-derivation detail used by
   `worktreeService` and is not surfaced on rows. Lamp colour tests/snapshots updated; user-facing
   note in `docs/user/running-switchboard.md`.

8. **Plug states enumerated** (review M4, L1-plug). The section uses two plug renderings: the existing
   `Plug` (closed union `off/idle/running/working/error`) for a **worktree** branch; and a new
   `BranchPlug` (ported from the prototype) for a **no-worktree** branch with states
   `dashed` (idle, click to create+launch) → `creating` → `launching` → `running`, plus `error`.
   `creating`/`launching` are guarded (no re-activation) and animate; `running` hands back to the
   normal session plug after the next branch-list refresh.

9. **Data: the branch list supersedes the worktree-list query as the section's display source, but
   the worktree/session flows are preserved** (review C2). The section's rows come from a new
   `['branches', repoId]` query (carrying worktree fields per Decision 3). Session liveness, launch,
   stop, and delete remain **`wtId`-keyed** (their existing queries/mutations are unchanged and key
   off `branchSummary.wtId` for worktree branches); `worktreeService.list` and `WorktreeSummary` are
   **retained** for the compound op, delete, and contract continuity — only the *section's display
   source* changes. The section MUST specify loading and a retryable error state for the branch query
   (review H3), distinct from the successful-but-`stale` remote-fetch flag.

10. **Telemetry: choose safe span-attribute keys** (review H2 — `branch` is already blocklisted; the
    redactor masks by key). `branchService` spans MUST NOT carry branch names under any key, and MUST
    emit counts under a key that is **not** matched by `/branch/i` (e.g. `ref.count`) so the count is
    not over-redacted. No "blocklist extension" is needed.

11. **Create-worktree modal branch picker fed by the branch listing** (review M3). The modal's
    "existing branch" / base-branch pickers — today passed empty/placeholder into `Worktrees` — are
    populated from the branch listing's remote/local names.

12. **Prototype disposition**: the prototype *code* (`parts.tsx`) is **ported** into the slice
    (implementation tasks). The `*.stories.tsx` ledger rows are reconciled at archive (expected
    `delete`), decided then.

## Testing strategy

**Unit (Vitest, against TS source):**

- `packages/shared`: `branchStatusSchema` + `branchSummarySchema` (worktree fields present iff
  `hasWorktree`; `prStatus` optional both ways).
- `apps/server` `gitService`: ref-enumeration over both namespaces and the best-effort `fetchAll`
  (refspec ensured; fresh clone discovers remote-only refs; unreachable remote → no throw); a
  regression test that `worktreeService.fetchOrigin` still behaves after the refactor onto it.
- `apps/server` `branchService`: the six-state derivation, one case per state, against the new
  branch-state git fixture; the `hasWorktree` + worktree-field marking; the `stale` flag on an
  unreachable remote; telemetry — a span carries a usable `ref.count` and **no** branch name.
- `apps/server` compound op: create→launch reaches running; idempotent double-activation on the
  `launch/...` key; a direct create/launch for the same `<wt-id>` arriving concurrently stays
  idempotent via its own key; create-fail → no launch; launch-fail-after-create → worktree present +
  typed error — using the existing orchestrator fake-service patterns.
- Route contract tests: `422` + typed-client mirror for branch-listing and launch-from-branch.
- `apps/web`: `filterBranches` (union + search); the control panel (toggle/search ↔ URL param sync)
  via `test-router`; `BranchLamp` tone+tooltip for six states + the regression that a worktree row
  uses the branch indicator (not `GitLamp`); the section's **loading** and **error/retry** states for
  the branch query; the `BranchPlug` states and that activating the dashed plug calls the compound-op
  client method (client mocked); that session/stop/delete still fire `wtId`-keyed for worktree
  branches after the data-source swap.

**Integration / E2E (Playwright, temp-git fixture):**

- Control panel filtering end-to-end; filter state in the **address bar** + restored on reload
  (extends `e2e/page-routing.spec.ts`).
- Dashed-plug create→launch happy path against a fixture branch with no worktree.

**Test-harness gap assessment (→ leading "Test infrastructure" task group):**

- **Branch-state git fixture (gap).** `branchService` unit tests need a bare clone whose branches
  span all six states with a real `origin`. The existing `fixtures/temp-git.ts` / worktree fixture
  seed only a single branch with no per-branch divergence. **Build `makeBranchStatesRepo`** first.
- **gitService/worktreeService refactor (reuse + 1 guard).** Extending `gitService` and refactoring
  `fetchOrigin` onto it reuses existing `GitRunner` test patterns; add a regression test that
  `fetchOrigin`'s contract is unchanged.
- **Compound-op fakes (reuse).** The session/worktree orchestrators already have fake-service
  patterns; reuse.
- **Web (reuse).** `story-router`/`test-router` cover routed-component unit tests; address-bar
  behaviour is Playwright-only (established).

## Risks / Trade-offs

- **[Branch-status cost on many-branch repos]** per-branch `merge-base` is O(branches). → Fast-path
  configured-upstream ahead/behind; `merge-base` only otherwise; consider a list cap; settle the
  exact plumbing against a real many-branch fixture (open question).
- **[`fetchOrigin` refactor regresses worktree create]** moving the fetch into `gitService` could
  change worktree-create behaviour. → A regression test pins `fetchOrigin`'s contract; the refactor
  is behaviour-preserving (same refspec, same best-effort semantics).
- **[Data-source swap breaks session/delete wiring]** the section changes its display query. →
  Decision 9 keeps session/launch/stop/delete `wtId`-keyed and unchanged; only the display source
  swaps; tests assert those flows still fire for worktree branches.
- **[Lamp colour inversion + GitLamp removal]** a visible change + dead-code risk. → Intentional;
  enumerate `GitLamp` consumers (only `WorktreesView`), remove `GitLamp`/`GitStatus`, keep
  `worktreeSync` internal; update snapshots; user note.
- **[Compound-op orphaned worktree]** create ok, launch fails. → Distinct `launch/...` key + leave the
  worktree present with a typed error for retry; idempotency guards double-activation.

## Open Questions

- Exact branch-status git plumbing + cost bound for many-branch repos (settle against a fixture).
- Concrete branch-list poll cadence / focus behaviour.
- `gone` upstream and non-origin remotes — Phase 1 treats `gone` as `local-only`, single `origin`.
