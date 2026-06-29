## 1. Test infrastructure

- [ ] 1.1 Build a reusable branch-state git-fixture builder (e.g. `makeBranchStatesRepo`) that
      produces a bare clone with a real `origin` whose branches span all six states — `local-only`,
      `remote-only`, `synced`, `ahead`, `remote-ahead` (local behind), and `diverged` — plus a couple
      with worktrees; reuse/extend `fixtures/temp-git.ts` and the worktree fixture rather than
      duplicating git setup.

## 2. Server: extend gitService with ref-enumeration + a best-effort repo-wide fetch

- [ ] 2.1 (red) Tests for `gitService` ref-enumeration (over `refs/heads/*` + `refs/remotes/origin/*`)
      and a best-effort `fetchAll` (ensures the `+refs/heads/*:refs/remotes/origin/*` refspec; a fresh
      bare clone discovers remote-only refs; an unreachable remote does not throw); a regression test
      that `worktreeService.fetchOrigin`'s contract is unchanged after it is refactored onto the
      shared capability.
- [ ] 2.2 (green) Add ref-enumeration + the best-effort repo-wide fetch (PAT via the existing
      credential helper) to `gitService`, and refactor `worktreeService.fetchOrigin` to call it.

## 3. Shared contracts (branch-listing)

- [ ] 3.1 (red) Failing tests for `branchStatusSchema` (six-state enum), `branchSummarySchema`
      (`name`, `status`, `hasWorktree`, and `wtId`/`dirty`/`path` present **iff** `hasWorktree`, plus
      the optional unused `prStatus`), and `branchListResponseSchema` (`branches` + `stale`).
- [ ] 3.2 (green) Add those schemas + inferred types to `packages/shared` and export them.

## 4. Server: branch enumeration + six-state status (branch-listing)

- [ ] 4.1 (red) `branchService` derivation tests — one case per state — against the 1.1 fixture,
      including the `hasWorktree` marking with the worktree fields carried.
- [ ] 4.2 (green) Implement status derivation via `gitService` refs: join `refs/heads` ×
      `refs/remotes/origin` on name, classify with `merge-base`/`rev-list --left-right --count`; map a
      `gone` upstream to `local-only`; attach worktree fields (`wtId`/`dirty`/`path`) from the
      worktree set for branches that have one.
- [ ] 4.3 (red) Tests for the `stale` flag (unreachable remote → branches still returned, `stale`
      true) and telemetry: a `branchService` span carries a usable count under a non-`/branch/i` key
      (e.g. `ref.count`) and **no** branch name anywhere.
- [ ] 4.4 (green) Wire the best-effort fetch + `stale` flag into the listing and choose
      span-attribute keys so counts are usable and branch names never appear (no blocklist change
      needed — `branch` is already masked by key).

## 5. Server: branch-listing route + contract

- [ ] 5.1 (red) Route test: malformed `<repo-id>` → `422` (handler not invoked); typed-client
      contract test for the branch-listing method.
- [ ] 5.2 (green) Add the branch-listing route (Zod-validated) and the typed-client method.

## 6. Server: create-from-branch + launch as one operation (worktree-management)

- [ ] 6.1 (red) Orchestrator tests (existing fake-service patterns): create→launch reaches running;
      idempotent repeat activation on the `launch/<repo-id>/<wt-id>` key; a concurrent direct
      worktree-create or session-launch for the same `<wt-id>` reconciles via its own key (not aliased
      onto the compound op); create-fail → nothing launched; launch-fail-after-create → worktree
      present + typed error.
- [ ] 6.2 (green) Implement the `launch-from-branch`-typed compound operation keyed
      `launch/<repo-id>/<wt-id>`, driving `worktreeService.create` (existing-remote) → await ready →
      `sessionService.launch` under the per-repo lock, with the partial-failure semantics above.
- [ ] 6.3 (red) Route test: malformed input → `422`; typed-client contract test for the
      launch-from-branch method.
- [ ] 6.4 (green) Add the create-and-launch-from-branch route (Zod-validated) and the typed-client
      method.

## 7. Web: filter logic + control panel

- [ ] 7.1 (red) Tests for `filterBranches` (union across switches + AND search) and the control panel
      (toggle/search ↔ URL-search-param sync, default = empty params) via the `test-router` harness.
- [ ] 7.2 (green) Port the prototype `FilterToggleGroup` + `SearchField` + `ControlPanel` into the
      slice; add a shared `validateSearch` schema to **both** `/` and `/$owner/$repo`; render the panel
      atop `ReposHome` and drive filter state from the URL.

## 8. Web: six-state branch indicator (lamp)

- [ ] 8.1 (red) `BranchLamp` tests — tone + tooltip for all six states (dim vs flashing purple, using
      the new branch-purple token, not the PR-merged token) — and the regression that a worktree row
      renders the branch indicator, not `GitLamp`; update the existing `Lamp`/`GitLamp` colour tests.
- [ ] 8.2 (green) Add the new branch-purple theme token + the dim-steady/flashing purple variants and
      a `BranchLamp` to the `Lamp` module; remove `GitLamp`/`GitStatus` (sole consumer is the worktree
      row) while keeping `worktreeSync` as an internal git-derivation detail; update affected
      snapshots.

## 9. Web: branch rows + section data source

- [ ] 9.1 (red) Tests: a section renders filtered branch rows from a `['branches', repoId]` query
      (worktree fields read from the branch summary); the section shows a loading affordance while
      loading, a retryable error on query failure, and a staleness hint when the response is `stale`.
- [ ] 9.2 (green) Port the prototype `BranchPlug`; implement the branch row + `RepoSection` consuming
      `['branches', repoId]` (modest poll/focus cadence) with loading/error/stale states; switch the
      section's **display source** from the worktree-list query to the branch list (retaining
      `worktreeService.list`/`WorktreeSummary` for the compound op, delete, and contract continuity).

## 10. Web: preserve session/delete wiring + dashed-plug action

- [ ] 10.1 (red) Tests: activating a no-worktree branch's dashed plug calls the compound-op client
      method and reflects creating→launching→running (client mocked); session-liveness, launch, stop,
      and delete still fire **`wtId`-keyed** for worktree branches after the data-source swap; the
      create-worktree modal's existing/base pickers are fed from the branch listing.
- [ ] 10.2 (green) Wire the dashed plug → the compound operation with single-status polling; keep the
      `wtId`-keyed session/launch/stop/delete queries/mutations intact (reading `wtId` from the branch
      summary); feed the create-modal pickers from the branch listing.

## 11. End-to-end (Playwright; requires `just build`)

- [ ] 11.1 (red) E2E: the control panel filters branches, the filter state is reflected in the address
      bar, and a reload restores it (extending `e2e/page-routing.spec.ts`).
- [ ] 11.2 (green) E2E: the dashed-plug create→launch happy path against a temp-git fixture branch with
      no worktree.

## 12. Documentation

- [ ] 12.1 merge → `docs/user/running-switchboard.md`: document the home control panel + branch
      search/filters, the six-state branch indicator and its tooltip, creating a worktree from a
      branch via the dashed plug, and the branch-lamp colour change vs the prior git lamp.
- [ ] 12.2 merge → `docs/dev/Architecture/model.c4` + `views.c4`: graduate the extended `gitService`
      (ref-enumeration + repo-wide fetch), `branchService` + its edges, and the
      `branches-control-panel-api` view from the Planned overlay into the permanent model (strip every
      `#todo`), delete `Planned/branches-control-panel.c4`, and re-validate the LikeC4 model.
