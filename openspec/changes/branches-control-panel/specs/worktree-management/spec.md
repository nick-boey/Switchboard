## ADDED Requirements

### Requirement: Create a worktree from a branch and launch its session as one operation

The system SHALL provide a server-owned operation that, for a branch with no worktree, **creates
the worktree** (existing-remote mode — valid both for a local branch that has no worktree and for a
remote-only branch) **and then launches its Claude session**, tracked as **one**
`launch-from-branch`-typed ledger operation keyed `launch/<repo-id>/<wt-id>` — a namespace
**distinct** from the worktree-create key `<repo-id>/<wt-id>` and the session-launch key
`session/<repo-id>/<wt-id>` — exposing **one** queryable status the client can poll. The operation
MUST drive the **existing** inner worktree-create and session-launch operations, each under its own
key (so the worktree-create's branch-equality collision check applies unchanged, and a concurrent
direct worktree-create or session-launch for the same `<wt-id>` reconciles idempotently via its own
key rather than being aliased onto this operation). It MUST sequence create→launch (it launches only
once the worktree is ready), MUST be idempotent under repeat activation of its own key (a second
activation while in flight returns the same operation, never a second worktree or session), and on
partial failure MUST leave a consistent, recoverable state: a create failure launches nothing and
reports a typed error; a launch failure **after** a successful create reports a typed error with the
worktree left present (so the user can retry the launch via the existing session-launch), never
silently orphaning a worktree. The operation MUST run under the per-repository git lock.

#### Scenario: The operation creates the worktree then launches, reaching running

- **WHEN** the create-and-launch operation is invoked for a branch with no worktree
- **THEN** it creates the worktree and then launches the session, and its single status progresses
  to running once the session is live

#### Scenario: Repeat activation is idempotent

- **WHEN** the create-and-launch operation is activated twice in quick succession for the same branch
- **THEN** the second activation returns the in-flight operation rather than starting a second one,
  and exactly one worktree and one session result

#### Scenario: A create failure launches nothing

- **WHEN** the worktree-create stage fails (e.g. a collision or an invalid branch)
- **THEN** the operation reports a typed error, no session is launched, and no partial worktree is
  left behind by the failed create

#### Scenario: A launch failure after a successful create is recoverable

- **WHEN** the worktree is created successfully but the session launch then fails
- **THEN** the operation reports a typed launch error with the created worktree left present, so a
  subsequent launch (the existing session-launch path, now that the worktree exists) can succeed

#### Scenario: A remote-only branch is created existing-remote then launched

- **WHEN** the operation is invoked for a `remote-only` branch (present on `origin`, no local ref)
- **THEN** the worktree is created in existing-remote mode from `origin/<branch>` and the session is
  then launched, as one tracked operation

#### Scenario: A concurrent direct create or launch for the same worktree reconciles via its own key

- **WHEN** the compound `launch/<repo-id>/<wt-id>` operation is in flight and a direct worktree-create
  (`<repo-id>/<wt-id>`) or session-launch (`session/<repo-id>/<wt-id>`) for the same `<wt-id>` arrives
- **THEN** the direct request reconciles idempotently against the inner operation under its own key
  (returning the in-flight or completed inner operation), and is never aliased onto, nor duplicates,
  the compound operation

### Requirement: Create-and-launch-from-branch API route, typed client, and contract

The API SHALL expose a create-and-launch-from-branch route that validates its input with Zod against
the shared schemas (invalid input → `422`, handler not invoked) and reports the shared
operation/launch status shape; the typed client MUST expose a matching method so schema drift fails
the contract test at build time.

#### Scenario: The route validates input and rejects malformed requests

- **WHEN** the create-and-launch route is called with a malformed `<repo-id>` or empty branch
- **THEN** the request is rejected with `422` and the handler is not invoked

#### Scenario: The typed client mirrors the route

- **WHEN** the typed client is built against the server's route types
- **THEN** it exposes a create-and-launch-from-branch method whose request/response types match the
  shared schemas, and any drift breaks the contract test

## MODIFIED Requirements

### Requirement: Worktrees-hub screen states

The web app SHALL provide the worktree **controls** within the home view's per-repository branch
sections — the create-worktree modal and the delete control — and **defers** the branch-row
composition, the branch indicator, the plug (session and dashed), and the per-section
list/empty/loading/error/staleness states to `repos-home` (so the row/indicator/plug contract lives
in one capability, not two). The create-worktree modal MUST let the user choose an existing branch or
a new branch (with a base-branch selector) and enable Create only for valid input, and its
existing-branch and base-branch pickers MUST be populated **from the branch listing** rather than
left empty. The delete control (shown on a branch that has a worktree) MUST reflect the
safe-to-delete predicate (presented as safe only when the worktree is safe to delete) and confirm
before a destructive removal — and because the merged-PR input has no data source in Phase 1, the
safe (lit) styling is **dormant** and the control MUST always confirm before removing; the surface
MUST adapt to mobile and desktop.

#### Scenario: The Add-worktree entry point remains available

- **WHEN** a repository section is rendered
- **THEN** the "Add worktree…" affordance that opens the create-worktree modal is available (the
  section's list/empty/loading/error states themselves are owned by `repos-home`)

#### Scenario: Create-worktree modal validates before Create enables

- **WHEN** the user opens the create-worktree modal and chooses an existing branch or a new
  branch with a base
- **THEN** the input is validated and Create is enabled only for a valid branch selection

#### Scenario: Create-worktree modal pickers are populated from the branch listing

- **WHEN** the create-worktree modal is opened for a repository
- **THEN** its existing-branch and base-branch pickers are populated from that repository's branch
  listing (its local and remote branch names), not left empty or placeholder

#### Scenario: Delete control reflects the safe-to-delete predicate

- **WHEN** a worktree is safe to delete (idle, PR merged, no uncommitted changes)
- **THEN** the delete control is presented as safe (the lit styling), and triggering it confirms
  before removing the worktree; otherwise the control is presented as not-safe and a removal is
  guarded/refused

#### Scenario: The safe (lit) styling is dormant in Phase 1

- **WHEN** the hub delete control is rendered in Phase 1, where no PR-status source is wired
- **THEN** no worktree reaches the safe (lit) styling, the control is presented as not-safe for
  every worktree, and triggering it always requires confirmation before removal
