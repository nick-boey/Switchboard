# repo-clone Specification

## Purpose
TBD - created by archiving change repo-clone-browse. Update Purpose after archive.
## Requirements
### Requirement: Bare clone to the canonical on-disk layout

The Git service SHALL bare-clone a chosen repository into
`~/.switchboard/repos/<owner>/<repo>/.bare`, producing a bare repository with no working
tree, where `<repo-id>` is namespaced by `<owner>/<repo>` so forks of the same name do not
collide.

#### Scenario: Clone lands at the canonical bare path

- **WHEN** the repository `<owner>/<repo>` is cloned successfully
- **THEN** a bare git repository (no working tree) exists at
  `~/.switchboard/repos/<owner>/<repo>/.bare`

#### Scenario: Same-named forks do not collide

- **WHEN** two repositories with the same name but different owners are cloned
- **THEN** each lands under its own `~/.switchboard/repos/<owner>/<repo>/.bare` path without
  overwriting the other

### Requirement: Owner/repo validation and path safety

The service SHALL validate `owner` and `repo` against a conservative safe charset and reject
path-traversal segments, deriving the on-disk destination only from the validated identifier;
it MUST accept either a full `https://github.com/<owner>/<repo>` URL — with an optional trailing
`.git` suffix (the shape copied from GitHub's clone dialog) — or a bare `<owner>/<repo>`,
normalizing the input by stripping any trailing `.git` before deriving `owner`/`repo`.

#### Scenario: A bare owner/repo or a full URL is accepted

- **WHEN** a clone target is given as `https://github.com/<owner>/<repo>` or as a bare
  `<owner>/<repo>`
- **THEN** both parse to the same validated `<owner>/<repo>` identifier

#### Scenario: A clone URL with a trailing `.git` suffix is accepted and normalized

- **WHEN** a clone target is given as `https://github.com/<owner>/<repo>.git`
- **THEN** the trailing `.git` is stripped and the target parses to the same validated
  `<owner>/<repo>` identifier as the suffixless URL

#### Scenario: Traversal is rejected

- **WHEN** a clone target contains a traversal or unsafe segment (e.g. `..`, an embedded `/`
  in a name, or an out-of-charset character)
- **THEN** the request is rejected before any filesystem path is constructed or any clone is
  started

### Requirement: List cloned repositories from disk

The service SHALL list already-cloned repositories by reading `~/.switchboard/repos`, and
MUST NOT list a repository whose clone did not complete.

#### Scenario: Completed clones are listed

- **WHEN** the cloned repositories are listed and `~/.switchboard/repos/<owner>/<repo>/.bare`
  is a completed clone
- **THEN** `<owner>/<repo>` appears in the list

#### Scenario: Incomplete clones are not listed

- **WHEN** a clone was interrupted and left a partial target on disk
- **THEN** that repository does not appear in the cloned-repository list

### Requirement: Clone runs as a tracked operation

The clone SHALL start as a tracked operation that returns immediately in a `cloning` state,
with a queryable status that reaches `ready` on success or a failed/aborted terminal state
otherwise, recorded in the filesystem operation ledger under `~/.switchboard`.

#### Scenario: Starting a clone returns immediately

- **WHEN** a clone is requested for a valid target
- **THEN** the request returns without waiting for the clone to finish, reporting the
  `<repo-id>` and an operation in a `cloning` state

#### Scenario: Status reaches ready on success

- **WHEN** the clone completes successfully
- **THEN** the operation status reports `ready` and the repository appears in the cloned list

### Requirement: Idempotent clone requests

A clone request for a repository that is already cloned or already in-flight SHALL return the
existing result or operation rather than starting a duplicate clone.

#### Scenario: Already-cloned is a no-op

- **WHEN** a clone is requested for a repository that already has a completed
  `~/.switchboard/repos/<owner>/<repo>/.bare`
- **THEN** no new clone is started and the request resolves to the existing repository

#### Scenario: In-flight duplicate returns the running operation

- **WHEN** a clone is requested for a repository whose clone is already running
- **THEN** the request returns the existing in-flight operation rather than starting a second
  clone

### Requirement: Per-repository serialization

Concurrent clone operations for the same repository SHALL be serialized by a per-repository
lock under `~/.switchboard`.

#### Scenario: Concurrent same-repo clones are serialized

- **WHEN** two clone requests for the same `<repo-id>` arrive concurrently
- **THEN** only one clone subprocess runs for that repository and the second observes the
  first operation rather than racing it

### Requirement: Clone cancellation

Aborting an in-flight clone SHALL transition the operation to `aborted`, terminate the git
subprocess, and remove the partial target so no half-written `.bare` remains. Abort and
clone-completion SHALL resolve under the **per-repository operation lock** as a **single
terminal transition**, and the abort path MUST re-check the completion marker before removing
anything: if completion wins the race, the abort request SHALL return the completed/`ready`
terminal status and MUST NOT delete the repository; if abort wins, cleanup SHALL remove ONLY
an incomplete target (a partial `.bare`) and never a completed one.

#### Scenario: Abort cancels and cleans up

- **WHEN** an in-flight clone is aborted
- **THEN** the git subprocess is terminated, the operation status is `aborted`, and the
  partial `~/.switchboard/repos/<owner>/<repo>/.bare` is removed

#### Scenario: Abort races a successful completion

- **WHEN** an abort request and the `git clone` subprocess's successful exit are handled
  concurrently for the same repository, so they contend for the per-repository operation lock
- **THEN** the two paths resolve as a single terminal transition: if completion wins, the abort
  request returns the `ready` terminal status and the completed
  `~/.switchboard/repos/<owner>/<repo>/.bare` is NOT deleted
- **AND** if abort wins, only an incomplete target is removed (gated on the completion marker)
  and a completed `.bare` is never deleted

### Requirement: Abort clone endpoint

The API SHALL expose an abort endpoint that aborts an in-flight clone operation identified by
its operation/`repo-id`, validating its input with Zod and reporting the operation's resulting
status; the typed client MUST expose a matching method so the UI's Abort action has a callable
contract that drives the Clone cancellation behaviour.

#### Scenario: Abort endpoint cancels an in-flight clone

- **WHEN** the abort endpoint is called with the identifier of an in-flight clone operation
- **THEN** the clone is cancelled (per Clone cancellation) and the endpoint responds with the
  operation in an `aborted` terminal state

#### Scenario: Abort endpoint rejects invalid input

- **WHEN** the abort endpoint is called with input that fails its Zod schema (e.g. a missing or
  malformed operation identifier)
- **THEN** the request is rejected with `422` and no abort is attempted

#### Scenario: Aborting an unknown or already-finished operation

- **WHEN** the abort endpoint is called for an operation that does not exist or has already
  reached a terminal state
- **THEN** the endpoint reports the operation's current terminal status (or a not-found result)
  without terminating any subprocess or starting new work

### Requirement: Restart recovery of interrupted clones

On startup the system SHALL reconcile any operation left in a `running` state with no live
process, transitioning it to `failed` and removing its partial target.

#### Scenario: A stale running operation is reconciled on restart

- **WHEN** the server restarts and the ledger holds a `clone` operation marked `running` whose
  process is no longer alive
- **THEN** that operation is reconciled to `failed`, its partial target is cleaned, and the
  repository is not listed as cloned

### Requirement: Credential-helper token handling with no leak

The PAT SHALL be supplied to git only via a credential helper that reads it from
`~/.switchboard`, and the PAT MUST NOT appear in the clone URL, the cloned repository's bare
config at `~/.switchboard/repos/<owner>/<repo>/.bare/config`, process arguments, or
logs/telemetry.

#### Scenario: PAT is absent from process arguments and the clone URL

- **WHEN** a clone subprocess is spawned
- **THEN** the PAT does not appear in the process arguments and the clone URL is the plain
  `https://github.com/<owner>/<repo>.git` with no embedded credentials

#### Scenario: PAT is not persisted to the bare repository config

- **WHEN** a clone completes
- **THEN** the bare repository's config at `~/.switchboard/repos/<owner>/<repo>/.bare/config`
  (the bare clone has no `.git/config`) holds neither a credential-helper entry nor a
  PAT-bearing remote URL — verified the way an implementation would, e.g.
  `git --git-dir ~/.switchboard/repos/<owner>/<repo>/.bare config --get-regexp
  '^(credential|remote\..*\.url)'` returns no credential-helper line and no remote URL with
  embedded credentials — and the PAT does not appear anywhere under the cloned repository

#### Scenario: PAT and sensitive fields are redacted from telemetry

- **WHEN** telemetry is emitted for a clone operation
- **THEN** no span or log contains the PAT, the clone URL, an absolute filesystem path, the
  command arguments, or a GitHub error body

### Requirement: Clone failures surface typed errors

A failed clone SHALL record a typed error (`unauthorized`, `not-found`, `rate-limited`, or a
generic git failure) on the operation so the UI can offer retry or abort without exposing
raw command or GitHub output.

#### Scenario: No access or missing repository

- **WHEN** the clone fails because the repository does not exist or the PAT lacks access
- **THEN** the operation records a `not-found`/`unauthorized` typed error and the operation
  status is a failed terminal state

### Requirement: New repository and getting-ready screens

The web app SHALL provide the New repository screen and the repository getting-ready screen,
and MUST specify their empty, in-progress, and error states. The New repository screen offers
a GitHub source (with Local disabled for the MVP) and either Select repository (validated,
editable owner and repository selectors, where the owner options include the authenticated
user's own account and their organisations) or From URL (validated); the getting-ready screen
renders the clone's in-progress, error, and ready states. The New repository screen's GitHub
source MUST distinguish three outcomes of loading the repository list — an in-progress
(connecting) state, a **failed-fetch error** state, and the resolved states (the not-configured
empty state or the ready selectors) — and MUST NOT remain in the connecting state indefinitely
when the repository-list request fails. Both adapt to mobile and desktop.

#### Scenario: Local source is disabled

- **WHEN** the New repository screen is shown
- **THEN** the source toggle offers GitHub and Local, with Local disabled (not selectable) for
  the MVP

#### Scenario: Select repository validates owner and repository before Clone enables

- **WHEN** the user picks an owner and a repository using the editable selectors
- **THEN** the owner is validated against the user's selectable owners (the authenticated
  user's own account or one of their organisations), the repository is validated against the
  repositories listed for that owner, and Clone is enabled only once both resolve

#### Scenario: A personal-account repository can be selected and cloned

- **WHEN** the user selects their own account as the owner and a repository they own personally
- **THEN** the repository validates against the personal repositories in the GitHub listing,
  Clone is enabled, and starting the clone targets `<account>/<repo>`

#### Scenario: An organisation repository can be selected and cloned

- **WHEN** the user selects one of their organisations as the owner and a repository in that
  organisation
- **THEN** the repository validates against that organisation's repositories in the GitHub
  listing, Clone is enabled, and starting the clone targets `<org>/<repo>`

#### Scenario: From URL validates and previews the target

- **WHEN** the user enters a `https://github.com/<owner>/<repo>` URL (optionally with a trailing
  `.git`) or a bare `<owner>/<repo>`
- **THEN** the field shows validity, previews the parsed `<owner>/<repo>` (with any trailing
  `.git` stripped), and Clone is enabled only for a value that parses

#### Scenario: Clone lands on the getting-ready in-progress state

- **WHEN** the user starts a clone
- **THEN** the app navigates to the repository getting-ready screen showing the in-progress
  state (a cloning indicator and an Abort action) while the clone operation runs

#### Scenario: Clone error state offers retry and abort

- **WHEN** the clone operation fails
- **THEN** the getting-ready screen shows the error state with Retry and Abort/back actions,
  without exposing raw command or GitHub output

#### Scenario: GitHub not configured empty state

- **WHEN** the New repository screen is shown and no GitHub PAT is configured
- **THEN** it shows an empty/unconfigured state prompting the user to add a PAT to
  `~/.switchboard`, rather than failing opaquely

#### Scenario: GitHub repository-list fetch failure shows an error state (regression)

- **WHEN** the New repository screen's GitHub repository-list request fails to resolve (for
  example the `/api/repos/github` call errors with a non-OK status such as `401`, or the network
  request fails)
- **THEN** the screen shows an explicit error state — distinct from the connecting/loading state
  and from the not-configured empty state — offering a retry, rather than remaining on
  "Connecting to GitHub…" indefinitely

