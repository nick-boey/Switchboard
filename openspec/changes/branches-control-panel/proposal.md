## Why

The repositories home lists only **worktrees**, so a user cannot see branches that have no
worktree, cannot tell at a glance how a branch relates to its remote, and cannot filter or
search what the home page shows. This is Phase 1 of GitHub issue #22 (git-only; the PR overlay
is the dependent `pr-indicators` change).

## What Changes

- The home page gains a **control panel** at the top: a **search** field plus three on/off
  filter toggles — **Worktrees**, **Local branches**, **Remote branches** — combined as a
  union (show a branch if it matches *any* enabled toggle), defaulting to **only Worktrees
  on**. Control-panel state lives in the home route's **URL search params**.
- Each repository section is **reframed around the branch** (local *and* remote), filtered by
  the control panel, replacing today's worktree-only rows. Sections with no matching branch
  collapse to an empty affordance.
- A new server **branch-listing** capability enumerates a repo's local + remote branches and
  derives a **six-state branch indicator** — local-only (blue), synced (green), ahead
  (yellow), diverged (red), remote-ahead (flashing purple), remote-only (dim purple) — with a
  tooltip. It owns a best-effort **repo-wide `git fetch`** (a bare clone has no `origin`
  refspec, so remote refs are otherwise empty) and surfaces a freshness/error state.
- **BREAKING (visual):** the branch indicator **redefines** the existing git-lamp colours on
  *every* branch row including worktree rows (today ahead→green/behind→yellow); affected
  unit/snapshot tests are updated and a user-facing note added.
- The per-branch **plug** keeps today's session on/off behaviour for branches with a worktree,
  and gains a **dashed** state for branches without one. Clicking the dashed plug runs a new
  **server-owned compound operation** that creates the worktree from that branch and launches
  its session as **one tracked operation** (one idempotency key, one status to poll), so
  partial failure and double-click races are handled server-side.
- The branch summary contract **reserves an optional `prStatus` field** that the `pr-indicators`
  change fills; the PR indicator stays display-only here.

## Capabilities

### New Capabilities

- `branch-listing`: server enumeration of a repository's local + remote branches, the
  six-state branch-status derivation (ref-namespace join + `merge-base`, not
  `%(upstream:track)`), the best-effort repo-wide fetch, and the freshness/error state. Reads
  the bare clone and the worktree set; never mutates.

### Modified Capabilities

- `repos-home`: the home view renders **filtered branch rows** (not worktree-only) with the
  control panel (search + Worktrees/Local/Remote toggles, union semantics, default
  worktrees-only, URL-search-param state), the six-state branch indicator + tooltip, the
  dashed-plug affordance for branches without a worktree, and per-section empty/collapse
  states.
- `worktree-management`: a **server-owned compound "create worktree from a branch, then
  launch"** operation — one tracked operation composing the existing worktree-create and
  session-launch, invoked by the dashed plug — with explicit creating/launching states and
  orphan/race handling.

## Impact

- **`packages/shared`**: new branch summary schema + `branchStatus` enum (six states); the
  optional `prStatus` field reserved for `pr-indicators`.
- **`apps/server`**: new `branchService` (`Switchboard.Api.branchService`) + a branch-listing
  route; the compound `POST /worktrees/launch-from-branch` (working name) tracked operation;
  **telemetry redaction** extended so enumerated branch names never reach plain span
  attributes (prefer counts).
- **`apps/web`**: a new **multi-toggle** filter control (the existing single-select
  `SegmentedToggle` does not fit) and a new dashed/`create` **Plug** state; the six-state
  **branch lamp** (incl. new dim-purple and flashing-purple `Lamp` variants); branch-row
  rendering per repository section; `validateSearch` on **both** `/` and `/$owner/$repo`
  (same component) for filter state; a TanStack Query branch-list query per repo.
- **Tests**: unit/snapshot updates for the git-lamp colour redefinition; new unit tests for
  branch-status derivation and the compound operation.
- **Baseline**: builds on the merged `page-routing` TanStack Router setup (verify against its
  Playwright suite). The `pr-indicators` change depends on this one.

### UI surfaces & prototypes

UI surfaces touched: the repositories home (control panel + branch rows), the branch
indicator lamp, and the plug. Prototypes under `src/prototypes/branches-control-panel/` will
explore: (1) the **control panel** layout (search + multi-toggle); (2) the **six-state branch
lamp** including the dim-purple and flashing-purple variants and the tooltip; (3) the
**dashed plug** state and its create→launch progress states; and (4) the **branch row** and a
repository section listing filtered branches.
