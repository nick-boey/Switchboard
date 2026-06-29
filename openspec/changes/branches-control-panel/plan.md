# Plan: branches-control-panel

<!-- Created during the planning interview (/switch-plan). The durable record of why this
     change exists and what architectural shape was agreed. -->

Addresses GitHub issue #22 ("Add branches tab"; empty body — the spec is the planning brief
below). This is **Phase 1** of a two-change programme; the PR/GitHub overlay is **Phase 2**
(`pr-indicators`). The split, the cross-phase contract seams, and the deferred PR decisions
live on the shared plan page (see **Plan page**).

## Problem

The repositories home today lists only **worktrees** per repository. A user cannot see
branches that exist but have no worktree (other locals, remotes), cannot tell at a glance how
a branch relates to its remote, and cannot filter or search what the home page shows.

Phase 1 makes the home page gain a **control panel** (search bar + on/off filter toggles) and
reframes each repository's section around the **branch** (local *and* remote), with a branch
status indicator light and the ability to spin up a worktree directly from a branch:

- **Filter toggles** (Phase 1): **Worktrees**, **Local branches**, **Remote branches** —
  each an inclusive "show items matching this" condition, combined as a union. Default: only
  **Worktrees** on. (The 4th toggle, **PR exists**, arrives in Phase 2.)
- **Search**: narrows the shown branches by name (AND with the toggles).
- **Branch indicator light** with a tooltip — six states (local/remote/divergence).
- **Plug per branch**: as today for branches with a worktree (session on/off); **dashed**
  when the branch has no worktree, and clicking it **creates a worktree from that branch and
  then starts a session** via a single server-owned operation.

The **PR indicator** stays display-only (as today) in Phase 1; Phase 2 gives it data and adds
the "PR exists" toggle.

## Architecture summary

A single vertical slice. It reuses the `Plug` and `Lamp`/`StatusLight` components (all six
tones already exist) and the existing worktree-create / session-launch subsystems — but the
adversarial review corrected two "reuse" overclaims: the control panel needs a **new
multi-toggle component** (the existing `SegmentedToggle` is single-select), and the `Plug`
needs a **new dashed/create state** (its status union is closed).

Server-side additions inside the **`Switchboard.Api`** container (LikeC4 names) — refined by the
Artifacts checkpoint (see `design.md` for the resolved decisions):

- The existing **`gitService`** gains **ref-enumeration + a best-effort repo-wide `git fetch`**
  (ensuring the `+refs/heads/*:refs/remotes/origin/*` refspec a bare clone lacks — review C1),
  reusing its existing credential-helper/GitHub edges; `worktreeService.fetchOrigin` is refactored
  onto this so there is **one** fetch implementation, not two (review H1).
- A new **`branchService`** component enumerates a repository's local + remote branches via the
  `gitService` refs and derives each branch's six-state indicator. **Critically** (review C2),
  `%(upstream:track)` cannot yield the six states on a bare clone (local heads have no upstream;
  remote-only is a set-difference; ahead/behind/diverged need counts), so state is computed by
  **joining `refs/heads` and `refs/remotes/origin` on name + `merge-base`** — *not* a single
  `for-each-ref` pass. `branchService` reads/fetches via **`gitService`** and marks has-worktree
  (with the worktree's fields) via **`worktreeService`**.

The compound dashed-plug action is **server-owned** (review H5): a new endpoint creates the
worktree and launches the session as **one tracked operation** (one idempotency key, one
status to poll), reusing the existing `worktreeService` + `sessionService` and the per-repo
git lock — so partial failure (orphaned worktree, lost launch) and double-click races are the
server's problem, not the UI's.

The web slice (**`Switchboard.WebSPA`**) adds the control panel (new multi-toggle), switches
each repository section to render **branches** (filtered) instead of worktrees, replaces the
git lamp with the global 6-state branch lamp (incl. two new purple variants), gives the plug a
dashed no-worktree state driving the compound endpoint, and holds filter state in the home
route's **URL search params** (`validateSearch` on both `/` and `/$owner/$repo`). Shared
**Zod contracts** in `packages/shared` gain a branch summary (carrying the worktree's fields when
the branch has one, so the branch list is the section's single data source — review C2; and
reserving an optional PR-status field for Phase 2) and a branch-status enum.

## Plan page

`docs/plans/switchboard/branches-and-pr-indicators.md` — arbitrates the Phase 1 / Phase 2
split, records the cross-phase contract seams, and holds the deferred PR-overlay decisions and
review findings (H1–H3, M2). Its `openspec-changes` frontmatter lists both
`branches-control-panel` and `pr-indicators`.

## Planned architecture

File: `docs/dev/Architecture/Planned/branches-control-panel.c4` (validated: `✓ Valid`).

Elements added:

- `Switchboard.Api.branchService` (component, `#todo`)

Relationships added (all `#todo`):

- `Switchboard.Api.branchService -> Switchboard.Api.gitService` (enumerates refs + triggers the
  repo-wide fetch the Git Service now owns)
- `Switchboard.Api.branchService -> Switchboard.Api.worktreeService` (has-worktree marking + fields)
- `Switchboard.Api.gitService -> GitHub` (best-effort repo-wide `git fetch` over HTTPS, reusing the
  Git Service's existing credential-helper edge)

Views added:

- `branches-control-panel-api` (of `Switchboard.Api`)

The server-owned compound endpoint reuses the existing `sessionService -> worktreeService`
wiring, so it adds no new element. At archive, `branchService` and its edges graduate into
`model.c4`, the view into `views.c4`, and this overlay file is deleted. The
`githubService -> GitHub` PR-read edge belongs to Phase 2 (`Planned/pr-indicators.c4`).

## Decisions

1. **Phased delivery.** This change is Phase 1 (git-only). PR overlay + PR lamp data + the
   "PR exists" toggle are Phase 2 (`pr-indicators`), which depends on this change. Rationale:
   the CRITICAL git findings make branch enumeration the thing to prove first, and it ships
   value with zero GitHub-API risk.

2. **Branch is the primary unit on the home page.** Each repository section lists branches
   (filtered); "has a worktree" is one property of a branch. With the default filter
   (Worktrees only) this looks much like today.

3. **Filter semantics = overlapping union.** A branch is shown if it matches **any** enabled
   toggle. "Local branches" = all local branches (incl. those with worktrees); "Worktrees" =
   the subset with a worktree. Search narrows by branch-name substring (AND). Default: only
   **Worktrees** on. Phase 1 toggles: Worktrees / Local / Remote.

4. **Branch indicator — six states, global** (redefine the lamp on *every* branch row incl.
   worktree rows), tooltip names the state:

   | State | Condition | Tone |
   |---|---|---|
   | local-only | local ref, no remote | blue |
   | synced | local + remote, equal | green |
   | ahead | local ahead of remote | yellow |
   | diverged | both sides have unique commits | red |
   | remote-ahead | local exists, strictly behind remote | **flashing** purple |
   | remote-only | remote ref, no local ref | **dim, steady** purple |

   This **inverts** the existing `GitLamp` colours (today ahead→green, behind→yellow), so the
   change MUST update the affected unit/snapshot tests and carry a user-facing note (tasks).
   Worktree rows naturally only ever exhibit the five local-applicable states (a checked-out
   branch is never `remote-only`). The dim-purple and flashing-purple variants are new visual
   states the `Lamp` does not have yet.

5. **Branch state computed by ref-namespace join + merge-base, not `%(upstream:track)`**
   (review C2). Enumerate `refs/heads/*` and `refs/remotes/origin/*`, join on branch name,
   and use `merge-base`/commit reachability to classify ahead/behind/diverged. Accept the
   per-branch cost this implies; the earlier "one cheap call" claim was wrong. A local branch
   whose upstream is `gone` is treated as `local-only` for Phase 1 (see Open question 2).

6. **`gitService` owns the best-effort repo-wide `git fetch origin`** (review C1, H1), ensuring
   the `+refs/heads/*:refs/remotes/origin/*` refspec (a bare clone configures none); the existing
   `worktreeService.fetchOrigin` is refactored onto it so there is one implementation.
   `branchService` triggers it via `gitService`. The remote branch list carries an explicit
   `stale` flag; a failed fetch degrades to the last-known refs rather than blocking the panel.

7. **Dashed-plug action is a server-owned compound operation** (review H5, C1): a new endpoint
   (working name `POST /worktrees/launch-from-branch`) runs as a `launch-from-branch`-typed ledger
   op keyed `launch/<repo-id>/<wt-id>` — a namespace **distinct** from the worktree key
   `<repo-id>/<wt-id>` and the session key `session/<repo-id>/<wt-id>` — driving the existing inner
   worktree-create (mode `existing-remote`, valid for a local branch with no worktree and for a
   remote-only branch) → launch ops, each under its own key. The client polls that single status;
   the plug state machine gains explicit `creating`/`launching` states. Orphaned-worktree and
   double-click races are handled server-side.

8. **Control-panel state in URL search params** of the home route (e.g.
   `/?worktrees=1&remote=1&q=feat`). `validateSearch` is added to **both** `/` and
   `/$owner/$repo` (same component, two routes) so deep-links keep filters; the default (only
   Worktrees on) encodes as the empty search so navigation/`<Link>`s don't churn state. Verify
   against page-routing's Playwright suite (review M3).

9. **One control panel, global**, at the top of the home page; applies across every repository
   section; sections with no matching branches collapse to an empty affordance.

10. **New UI components, not reuses** (review H4, L1): a multi-toggle filter control (the
    existing single-select `SegmentedToggle` does not fit) and a dashed/`create` `Plug` state.
    Both, plus the 6-state branch lamp (dim/flashing purple) and the control-panel layout,
    are sketched in the `switch-ui-prototype` stage before design is recorded.

11. **Telemetry redaction extended** (review L2): branch names are sensitive (existing code
    blocklists `branch`). New `branchService` spans MUST keep branch names off plain span
    attributes (prefer counts); add the blocklist update as an explicit task.

12. **PR indicator stays display-only in Phase 1.** The branch summary contract reserves an
    optional PR-status field that Phase 2 fills; the existing `PrLamp` behaviour is unchanged
    here.

13. **Documentation destinations** (seed for `docs-migration.md`):
    - *Author/update* `docs/user/running-switchboard.md` — the home control panel, the branch
      indicator + tooltip, and creating a worktree from a branch via the plug.
    - *Graduate* `Planned/branches-control-panel.c4` into `model.c4` + `views.c4`, then delete
      the overlay.
    - *Trim* the shared plan page (remove Phase-1 content; it survives until Phase 2 archives).
    - Delta specs touch `repos-home` and `worktree-management`; a new capability for the
      control-panel/branch-filtering behaviour is decided at the specs stage.

## Open questions

1. **Branch state algorithm cost.** Exact git plumbing for the join + ahead/behind/diverged
   classification (e.g. `for-each-ref` for the name sets + per-pair `merge-base`/`rev-list`),
   and whether to bound it for repos with hundreds of remote branches. Prototype against a
   real multi-branch bare clone in design (review C2).

2. **`gone` upstream + non-origin remotes.** Phase 1 maps a `gone` upstream to `local-only`
   and assumes a single `origin` remote. Confirm whether a distinct "upstream gone" treatment
   or multi-remote support is wanted (likely a later change).

3. **Fetch cadence / freshness UX.** How often `branchService` fetches (on-focus + interval?)
   and how the freshness/error state is shown without being noisy (review C1).

4. **Capability split for the delta specs** — control panel + branch filtering as its own
   capability vs folding into `repos-home`. Decide at the specs stage.

5. **Many-branch ergonomics.** Repos with hundreds of remote branches: search + section
   collapse, or a list cap / virtualisation / "show more"? Surface in the UI prototype stage.
