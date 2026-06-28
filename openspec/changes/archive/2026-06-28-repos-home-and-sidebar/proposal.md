## Why

The web app shows one repository per page — cloned repos are reachable only behind the
sidebar's "Worktrees" button as a master-detail selection, and the home view shows only a
diagnostic card. There is no single place to see everything you have cloned, and no
per-repository navigation.

## What Changes

- **Home page becomes the repositories hub.** The home view lists **every cloned
  repository across all organisations**, grouped by organisation and sorted
  organisation-then-repository alphabetically. Each repository renders as an anchored
  section showing its **worktrees inline** (reusing the existing `Worktrees` container, so
  the per-worktree session plug, create-modal, and delete-confirm behaviour is preserved).
- **Sidebar lists repositories grouped by organisation.** The navbar shows a subheading
  per organisation and one button per repository (same grouping/sort). Activating a repo
  button navigates to the home page and scrolls that repository's section into view
  (mount-then-scroll for cross-view activation). "New repository" stays as a distinct
  top-level action.
- **Remove the master-detail Worktrees flow.** The `WorktreesHub` repo-selection step and
  the "Worktrees" sidebar entry are removed — worktrees are now always shown inline on the
  home page.
- **Remove the "Line status" card** entirely (and the SPA's placeholder `echo` round-trip
  from this surface). It is no longer shown anywhere; the header's live-session count is
  unaffected.
- **Empty / loading / error states.** Because the cloned-repositories list now drives the
  primary home and navigation, the three resolved states are distinguished and a failed or
  loading list is never shown as "empty". When nothing is cloned: the sidebar shows only the
  "New repository" button (no organisation list); the home page shows a short message about
  cloning a repository and a "Clone a repository" button that opens the New repository flow.
  While the list loads, the home shows a loading affordance; if the list query fails, the home
  shows an error message (distinct from empty) with a retry control. In every state the
  sidebar's "New repository" action stays reachable, and repository buttons render only from a
  successfully resolved list.
- **Add a shared, unit-tested grouping helper** (`groupReposByOrg`) consumed by both the
  home page and the sidebar so the two surfaces never diverge.

Navigation stays `useState`-based: anchoring uses DOM fragment ids + `scrollIntoView`
(with `scroll-margin-top` to clear the sticky header). No router dependency is added.

## Capabilities

### New Capabilities

- `repos-home`: the single-page repositories home — aggregating all cloned repositories
  across organisations into one anchored, organisation-grouped, alphabetically-sorted page
  with each repository's worktrees inline — and its per-organisation sidebar navigation
  (one deep-linking button per repository), including the empty states for both surfaces.

### Modified Capabilities

<!-- None. The change reuses existing data and components without altering their
     spec-level requirements: worktree-management (backend create/list/delete),
     ui-design-language (primitives), repo-clone / github-repos (clone + listing), and
     app-runtime (the echo route still exists; this surface simply stops calling it) are
     all unchanged at the requirement level. -->

## Impact

- **`apps/web` only** — no `apps/server`, `packages/shared`, contract, or dependency
  changes, and no LikeC4 model impact (the SPA is a single opaque container).
  - New aggregated home composition + `groupReposByOrg` helper (with tests) in the
    `src/repos` slice; reuses `Worktrees` / `WorktreesView` and the `NewRepository` /
    `ReposFlow` clone flow.
  - `AppShell` navbar rebuilt (per-org repo links, deep-link scroll) and its main region
    rewired to the new home; the `lineStatus` query and "Line status" card deleted; the
    `view` state collapses (the standalone `worktrees` view is absorbed into home).
  - `WorktreesHub`'s repo-selection step retired (its inline worktree rendering lives on,
    one block per repo).
- **UI surfaces & prototypes.** Prototypes under `src/prototypes/repos-home-and-sidebar/`
  explore: (1) the aggregated repositories home (organisation grouping, inline worktrees,
  anchored sections, and the empty "Clone a repository" state); (2) the restructured
  sidebar (per-organisation subheadings, per-repo deep-link buttons, and the empty
  "New repository"-only state); and the deep-link scroll behaviour tying the two together.
