## MODIFIED Requirements

### Requirement: Single aggregated repositories home

The web app SHALL present, as its home view, a single page that lists every cloned
repository across all organisations on one page — with no per-repository selection or
drill-in step — grouping repositories by organisation and ordering organisations, then
repositories within each organisation, alphabetically (case-insensitive), and rendering
each repository's **filtered branches** inline within that repository's section — one
**branch row** per branch (its branch name, its branch indicator, and its plug), where
having a worktree is one property of a branch rather than the unit of display. Which
branches appear is governed by the home control panel (default: only branches that have a
worktree, which reads much like the prior worktree-only view).

#### Scenario: Every cloned repository appears on one page

- **WHEN** the home view is rendered with repositories cloned across more than one
  organisation
- **THEN** every cloned repository is shown on the same page, each within a section labelled
  by its `<owner>/<repo>` identity, with no step that selects a single repository before its
  branches can be seen

#### Scenario: Organisation-then-repository alphabetical ordering

- **WHEN** the home view lists repositories belonging to several organisations
- **THEN** the organisations appear in case-insensitive alphabetical order, and the
  repositories within each organisation appear in case-insensitive alphabetical order

#### Scenario: Branches render inline per repository

- **WHEN** a repository shown on the home page has one or more branches that pass the active
  filters
- **THEN** those branches are displayed inline as branch rows within that repository's section
  without navigating away from the home page
- **WHEN** a repository has no branch that passes the active filters
- **THEN** its section shows an empty affordance in place of any branch rows

#### Scenario: A newly cloned repository appears without a reload

- **WHEN** a repository's clone operation reaches the ready state
- **THEN** that repository appears in the repositories home and the sidebar without reloading the app

## ADDED Requirements

### Requirement: Home control panel — branch search and filter switches

The web app SHALL render, at the top of the home view, a control panel containing a
branch-name search field and independent on/off filter switches — **Worktrees**, **Local
branches**, **Remote branches** — that combine as a **union**: a branch is shown when it
matches **any** enabled switch. The search field SHALL further narrow the shown branches by
case-insensitive branch-name substring (combined with the switches as AND). The panel's state
(search text + switches) SHALL be held in the home route's URL search params so it survives a
reload and is shareable, and SHALL default to **only Worktrees on** (encoded as the empty
search). The single panel applies across every repository section.

#### Scenario: Default shows only branches with a worktree

- **WHEN** the home view is first rendered with no filter params in the URL
- **THEN** only the **Worktrees** switch is on, and each repository section shows only its
  branches that have a worktree

#### Scenario: Enabling Local or Remote reveals more branches (union)

- **WHEN** the user turns on **Local branches** (or **Remote branches**) in addition to Worktrees
- **THEN** the sections additionally show branches that are local (or that exist on the remote),
  with each branch shown once even when it matches several enabled switches

#### Scenario: Search narrows the shown branches by name

- **WHEN** the user types a query in the search field
- **THEN** only branches whose name contains that query (case-insensitive) remain shown, within the
  set already permitted by the enabled switches

#### Scenario: Filter state lives in the URL and survives reload

- **WHEN** the user changes the switches or search and then reloads, or copies the URL to a new tab
- **THEN** the control panel restores the same search text and switch states from the URL search
  params, and the default state (only Worktrees) corresponds to a URL with no filter params

### Requirement: Branch status indicator on each branch row

Each branch row SHALL render a branch indicator light reflecting the branch's six-state status with
a tooltip naming the state: `local-only` → blue, `synced` → green, `ahead` → yellow, `diverged` →
red, `remote-ahead` → a **flashing** purple, and `remote-only` → a **dim, steady** purple. This
branch indicator SHALL replace the prior git-status lamp on **every** branch row, including rows for
branches that have a worktree (a worktree row's branch is always checked out locally, so it never
shows the `remote-only` state).

#### Scenario: Each status maps to its tone and tooltip

- **WHEN** a branch row is rendered for a branch in a given status
- **THEN** its indicator shows the tone mapped to that status and exposes a tooltip naming the state

#### Scenario: Remote-ahead flashes and remote-only is steady-dim

- **WHEN** a `remote-ahead` branch and a `remote-only` branch are rendered
- **THEN** the `remote-ahead` indicator pulses (flashing purple) while the `remote-only` indicator
  is dim and steady, so the two purple states are distinguishable in motion

#### Scenario: Worktree rows use the branch indicator, not the old git lamp

- **WHEN** a branch that has a worktree is rendered on the home page
- **THEN** its row shows the six-state branch indicator (e.g. `synced` green / `ahead` yellow), not
  the previous four-state git-status lamp

### Requirement: A branch without a worktree offers a dashed plug that creates and starts it

A branch row for a branch with **no** worktree SHALL render a **dashed** plug; activating that plug
SHALL invoke the server-owned create-worktree-then-launch operation (specified by
`worktree-management`) for that branch and reflect its progress on the plug (creating → launching →
running), guarding against repeat activation while in progress and surfacing an error if it fails. A
branch row for a branch that already has a worktree SHALL retain the existing session-plug behaviour
(activate to launch when off, to stop when live).

#### Scenario: A branch with no worktree shows a dashed plug

- **WHEN** a branch row is rendered for a branch that has no worktree
- **THEN** its plug is shown dashed, distinct from a worktree branch's solid session plug

#### Scenario: Activating the dashed plug creates the worktree and starts the session

- **WHEN** the user activates the dashed plug on a branch with no worktree
- **THEN** the server-owned create-and-launch operation is invoked for that branch, the plug shows
  the creating → launching → running progression, and repeat activation is guarded while it runs

#### Scenario: A failure in the create-and-launch flow surfaces an error

- **WHEN** the create-and-launch operation fails at either stage
- **THEN** the plug surfaces an error rather than silently appearing complete

#### Scenario: A branch with a worktree keeps the session plug

- **WHEN** a branch row is rendered for a branch that already has a worktree
- **THEN** its plug behaves as the existing session plug (activate to launch when off, to stop when
  live; transient states guarded)

### Requirement: Per-section branch list loading, error, and staleness states

Each repository section SHALL distinguish the states of its branch-list query — loading, error, and
loaded — and own the per-section empty affordance (the `worktree-management` hub defers these
section states to the home view). While a section's branches are loading it SHALL show a loading
affordance and not the empty affordance; when the branch-list query fails it SHALL show a retryable
error distinct from the empty state; and when the list loaded but its remote view is stale (the
best-effort fetch failed, per `branch-listing`) it SHALL still render the branches and surface an
unobtrusive staleness indication rather than an error.

#### Scenario: A section shows a loading affordance while its branches load

- **WHEN** a repository section is rendered while its branch-list query is still loading
- **THEN** it shows a loading affordance and does not show the empty "no branches match" affordance

#### Scenario: A failed branch-list query shows a retryable error

- **WHEN** a section's branch-list query fails
- **THEN** the section shows an error distinct from the empty state, with a control to retry loading

#### Scenario: A stale remote view still renders branches with a staleness hint

- **WHEN** a section's branch list loaded successfully but its `branch-listing` response is `stale`
  (the best-effort remote fetch failed)
- **THEN** the section still renders the branches and shows an unobtrusive staleness indication, not
  an error
