## ADDED Requirements

### Requirement: Single aggregated repositories home

The web app SHALL present, as its home view, a single page that lists every cloned
repository across all organisations on one page — with no per-repository selection or
drill-in step — grouping repositories by organisation and ordering organisations, then
repositories within each organisation, alphabetically (case-insensitive), and rendering
each repository's worktrees inline within that repository's section.

#### Scenario: Every cloned repository appears on one page

- **WHEN** the home view is rendered with repositories cloned across more than one
  organisation
- **THEN** every cloned repository is shown on the same page, each within a section labelled
  by its `<owner>/<repo>` identity, with no step that selects a single repository before its
  worktrees can be seen

#### Scenario: Organisation-then-repository alphabetical ordering

- **WHEN** the home view lists repositories belonging to several organisations
- **THEN** the organisations appear in case-insensitive alphabetical order, and the
  repositories within each organisation appear in case-insensitive alphabetical order

#### Scenario: Worktrees render inline per repository

- **WHEN** a repository shown on the home page has one or more worktrees
- **THEN** those worktrees are displayed inline within that repository's section without
  navigating away from the home page
- **WHEN** a repository shown on the home page has no worktrees
- **THEN** its section shows an empty "no worktrees" affordance in place of any worktree rows

#### Scenario: A newly cloned repository appears without a reload

- **WHEN** a repository's clone operation reaches the ready state
- **THEN** that repository appears in the repositories home and the sidebar without reloading the app

### Requirement: Per-organisation sidebar navigation with repository deep-links

The navigation rail SHALL list one button per cloned repository, grouped under a subheading
per organisation using the same grouping and case-insensitive ordering as the home page, and
activating a repository's button SHALL make the home view active and bring that repository's
section into view. The rail SHALL present the "New repository" action at the bottom of the
rail, below the per-organisation repository list.

#### Scenario: One deep-linking button per repository under its organisation

- **WHEN** the navigation rail is rendered with cloned repositories
- **THEN** each organisation is shown as a subheading with one button per repository beneath
  it, in the same organisation-then-repository alphabetical order as the home page

#### Scenario: Activating a repository link reveals its section on the home page

- **WHEN** a repository's sidebar button is activated while a non-home view is active
- **THEN** the home view becomes active and that repository's section is scrolled into view,
  with the scroll applied after the section has mounted so the target is reliably reached

#### Scenario: Distinct repositories get distinct, collision-proof anchors

- **WHEN** two cloned repositories have valid `<owner>/<repo>` targets that differ only in
  where a separator falls (for example `a-b/c` and `a/b-c`)
- **THEN** each repository's section has a distinct anchor, and each sidebar button navigates
  to its own repository's section and never to the other's

#### Scenario: The new-repository action sits at the bottom of the rail

- **WHEN** the navigation rail is rendered
- **THEN** the "New repository" action appears at the bottom of the rail, below the
  per-organisation repository list

### Requirement: Empty states for the repositories home and sidebar

When the cloned-repositories list has resolved with no repositories, the home page SHALL show
a short message about cloning a repository together with an action that opens the
new-repository (clone) flow, and the navigation rail SHALL show only the "New repository"
action with no organisation subheadings or repository buttons.

#### Scenario: Empty home offers a clone call-to-action

- **WHEN** the home view is rendered after the cloned-repositories list has resolved with zero
  repositories
- **THEN** it shows a brief message about cloning a repository and a control that opens the
  new-repository flow

#### Scenario: Activating the empty-home clone call-to-action opens the new-repository flow

- **WHEN** the clone call-to-action on the empty home is activated
- **THEN** the app moves to the new-repository view (the same flow the sidebar's
  "New repository" action opens)

#### Scenario: Empty sidebar shows only the new-repository action

- **WHEN** the navigation rail is rendered after the cloned-repositories list has resolved with
  zero repositories
- **THEN** no organisation subheadings or repository buttons are shown, and only the
  "New repository" action appears

### Requirement: Loading and error states for the repositories home and sidebar

The home page SHALL distinguish three states of the cloned-repositories list — loading,
error, and empty — and SHALL NOT present a loading or failed list as the empty
"no repositories" state, because that list is the data source for the app's primary home and
navigation. While the list is loading, the home page SHALL show a loading affordance; when the
list query fails, the home page SHALL show an error message distinct from the empty state
together with a control to retry loading. In every state — loading, error, empty, or populated
— the navigation rail SHALL keep the "New repository" action reachable, and SHALL render
repository buttons and organisation subheadings only from a successfully resolved list (never
from a loading or failed one).

#### Scenario: Home shows a loading affordance while repositories load

- **WHEN** the home view is rendered while the cloned-repositories query is still loading
- **THEN** it shows a loading affordance and does **not** show the empty "clone a repository"
  call-to-action

#### Scenario: Home surfaces a retryable error distinct from the empty state

- **WHEN** the cloned-repositories query fails
- **THEN** the home view shows an error message that is distinct from the empty state — it does
  not present the failure as "no repositories cloned" — and offers a control to retry loading
  the list

#### Scenario: The new-repository action stays reachable while loading or on error

- **WHEN** the navigation rail is rendered while the cloned-repositories query is loading or
  after it has failed
- **THEN** the "New repository" action is still shown (the user can always start a clone), and
  no organisation subheadings or repository buttons are rendered from the unresolved or failed
  list
