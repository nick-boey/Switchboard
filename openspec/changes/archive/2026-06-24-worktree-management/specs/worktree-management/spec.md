## ADDED Requirements

### Requirement: Canonical path-safe worktree ID scheme

The system SHALL derive a worktree identifier `<wt-id>` from a branch name using a pure,
deterministic function exposed from `packages/shared`, such that the identifier is path-safe,
**collision-resistant** across distinct branch names — distinct branches yield distinct
identifiers with a bounded, vanishingly small truncated-hash collision probability, which is **not
an absolute guarantee** and is backstopped by the mandatory create-time collision detection of the
worktree-create requirement (which **rejects** a distinct-branch collision with a typed error and
**never mutates the derived identifier**, so the function stays pure and every listed worktree's
`<wt-id>` equals the derivation of its branch) — and reused unchanged for the tmux session name in
`claude-session-launch`; the human-readable branch name MUST be stored and recovered separately
from the identifier. The identifier MUST combine a lossy human-recognisable slug (the branch
transliterated to the conservative safe charset `[a-z0-9._-]`, with `/`, whitespace, Unicode,
and control runs collapsed to `-`, length-capped) with a hash suffix computed over the exact raw
branch bytes, so that branches differing only by case or by characters the slug drops still
produce distinct identifiers.

#### Scenario: A simple branch produces a recognisable path-safe id

- **WHEN** `<wt-id>` is derived for a branch such as `feature/remote-control`
- **THEN** the identifier is path-safe (only `[A-Za-z0-9._-]`, no `/`, no traversal segment), and
  its slug portion recognisably reflects the branch (e.g. `feature-remote-control`)

#### Scenario: Adversarial branch names produce valid identifiers

- **WHEN** `<wt-id>` is derived for an adversarial branch name (containing `/`, a traversal
  segment such as `../x` or `..`, spaces, Unicode/emoji, a reserved name such as `.git`, or an
  excessively long name)
- **THEN** the resulting identifier is non-empty, passes the path-safety validator, contains no
  traversal or out-of-charset segment, and is within filesystem and tmux name-length limits

#### Scenario: Distinct branches produce distinct identifiers, including case-folding pairs

- **WHEN** identifiers are derived for two distinct branch names that fold to the same slug or to
  the same name on a case-insensitive filesystem (e.g. `Feature/X` and `feature/x`)
- **THEN** the two identifiers differ, because the hash suffix is computed over the exact raw
  branch bytes (collision resistance; the create requirement provides the mandatory backstop for
  the residual truncated-hash collision probability)

#### Scenario: Derivation is deterministic

- **WHEN** `<wt-id>` is derived twice for the same branch name
- **THEN** the same identifier is produced both times

#### Scenario: The branch name is recovered separately from the id

- **WHEN** a worktree exists on disk for a branch whose slug is lossy
- **THEN** the exact branch name is recovered from git (the worktree's checked-out branch), not
  reconstructed from the identifier

### Requirement: Create a worktree at the canonical on-disk layout

The system SHALL create a worktree inside an already-cloned bare repository at
`~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>`, producing a real working tree on a
branch, where the on-disk destination is derived only from a re-validated `<repo-id>` and
`<wt-id>`; the request MUST distinguish creating a worktree for a branch that **already exists on
the remote** from creating a **new branch**, and a worktree MUST NOT be created when no bare clone
exists for the repository. Before any filesystem path or tmux name is constructed or reused, the
create MUST perform a **mandatory collision check**: it MUST compare the candidate `<wt-id>`
against the existing worktrees on disk (each worktree's branch recovered from git and compared
**exactly**, case-sensitively), and when a **different** branch would map to the **same** `<wt-id>`
as an existing worktree, the create MUST detect the collision and **reject** it with a typed
collision error — it MUST NOT extend or otherwise mutate the identifier, and it MUST NOT alias two
distinct branches onto one worktree path or tmux name. A repeat create for the **same** branch is
the idempotent path, not a collision.

#### Scenario: Worktree lands at the canonical path on a branch

- **WHEN** a worktree is created for a valid cloned repository and branch
- **THEN** a working tree exists at `~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>` checked
  out on that branch, alongside (not replacing) the bare repository at `.bare`

#### Scenario: Existing remote branch is checked out and tracked

- **WHEN** a worktree is created for a branch that already exists on the remote
- **THEN** the worktree checks out that existing branch and is set to track the remote branch

#### Scenario: New branch is created from a base

- **WHEN** a worktree is created requesting a new branch
- **THEN** a new branch is created from the requested base (defaulting to the repository's default
  branch) and checked out in the new worktree

#### Scenario: Path safety is enforced before any path is constructed

- **WHEN** a worktree create is requested with an unsafe or empty branch, or an invalid
  `<repo-id>`
- **THEN** the request is rejected before any filesystem path is constructed or any git command is
  run

#### Scenario: Creating a worktree requires a cloned repository

- **WHEN** a worktree create is requested for a repository that has no completed bare clone on
  disk
- **THEN** the request fails with a typed error and no worktree directory is created

#### Scenario: A create-time identifier collision across distinct branches is detected and rejected

- **WHEN** a worktree create would derive a `<wt-id>` that already belongs to an existing worktree
  checked out on a **different** branch (a truncated-hash collision)
- **THEN** the create detects the collision and **rejects** it with a typed collision error, before
  any filesystem path or tmux name is constructed or reused, without extending or mutating the
  identifier, so two distinct branches are never aliased onto one worktree path

#### Scenario: Case-folding branch pairs create distinct worktrees on a case-insensitive filesystem

- **WHEN** worktrees are created for two branches that differ only by case (e.g. `Feature/X` and
  `feature/x`) on a case-insensitive filesystem
- **THEN** each lands at its own distinct `<wt-id>` directory and neither aliases the other,
  because the identifier's hash suffix is computed over the exact raw branch bytes

#### Scenario: A pre-existing directory at the destination is refused and never deleted by cleanup

- **WHEN** a worktree create targets a `<wt-id>` path that already exists on disk as a normal
  directory that git does not report as a worktree and that this operation did not create (e.g. a
  user's data or a directory left by an earlier attempt the operation did not claim)
- **THEN** the create fails with a typed error without claiming ownership of that path, and the
  failure-cleanup path leaves the pre-existing directory and its contents intact — cleanup MUST
  only remove a destination this operation provably created (claimed via an **operation-scoped**
  ownership marker — a per-operation token written as the marker's content before any filesystem
  mutation — where cleanup removes the destination only when the marker's token equals the failed
  operation's own token), so it never deletes a path it did not create, while a genuine partial
  worktree this operation did create is still removed and a completed worktree is never removed

#### Scenario: The destination is claimed atomically so no concurrent directory is mistaken for ours

- **WHEN** a worktree create reaches its destination claim and the destination path does not yet
  exist, but a foreign process could create a directory there concurrently
- **THEN** the create claims the destination by **exclusively creating the destination directory
  itself** (an atomic create that fails if the path already exists), rather than by probing for
  existence and then writing an ownership marker in a separate step — so an already-existing path
  fails atomically with a typed `dest-exists` error and the operation NEVER records ownership of (or
  later deletes) a directory it did not itself create; the ownership marker is written only after
  the exclusive create succeeds, and the exclusive claim composes with `git worktree add`, which
  accepts the pre-existing empty directory the claim created

#### Scenario: A stale or foreign ownership marker never authorizes deleting another operation's or a user's data

- **WHEN** a worktree create targets a `<wt-id>` path beside which an ownership marker left by a
  **different** operation is present (its recorded token does not match this operation's token —
  e.g. a marker left behind by the conservative no-pid reconcile while the path was absent), and the
  path now holds a normal directory this operation did not create
- **THEN** the create fails with the typed `dest-exists` error without claiming the path, and the
  failure-cleanup for this operation — which removes a destination only when the marker's token
  matches this operation's own token — leaves the foreign-marked directory and its contents intact,
  so a stale or foreign marker can never re-authorize deleting another operation's or a user's data
  (each create attempt, including a retry, carries a fresh unique token)

#### Scenario: Cleanup authorization is bound to the directory's filesystem-object identity, not just its pathname

- **WHEN** an operation atomically created a partial worktree directory at its `<wt-id>` path
  (recording, alongside its token, the directory's filesystem-object identity — at least its
  device and inode numbers — captured immediately after the exclusive create), and that partial is
  later removed and **replaced** by a different directory object at the same pathname (e.g. user
  data re-created there) before failure-cleanup for the operation runs
- **THEN** failure-cleanup, even when given the operation's own matching token, MUST additionally
  require the directory currently on disk to have the SAME recorded filesystem-object identity
  before any recursive delete; a matching token whose directory identity DIFFERS (the path was
  replaced) MUST NOT authorize deleting the replacement — cleanup leaves the replacement directory
  and its contents intact and only clears its own now-stale marker — while a genuine partial whose
  identity still matches is removed and a completed worktree is never removed, so a stale token
  marker can never re-authorize deleting a different filesystem object that merely shares the pathname

### Requirement: Worktree creation runs as a tracked, serialized, recoverable operation

The system SHALL run worktree creation through the shared filesystem operation ledger as a
`worktree`-typed operation keyed by `<repo-id>/<wt-id>`, returning immediately with a queryable
status; the operation MUST record the **exact requested branch** in its metadata, and duplicate
creates for the same `<repo-id>/<wt-id>` MUST be idempotent **only when the requested branch is
exactly (case-sensitively) the same** — idempotent reuse MUST check branch equality first, so that
**same key + same branch** returns the existing operation while **same key + a different branch** (a
truncated-hash collision) is surfaced as the **same typed collision error** raised by the create
requirement, at the operation/orchestrator boundary, rather than aliasing the request onto the
existing worktree's operation; git mutations to a
single bare repository MUST be serialized, an aborted create MUST clean its partial worktree as a
single terminal transition that never removes a completed worktree, and a `running` worktree
operation with no live process MUST be reconciled to `failed` and cleaned on restart.

#### Scenario: Create starts as a tracked operation and reaches ready

- **WHEN** a worktree create is requested for a valid target
- **THEN** the request returns immediately with an operation in an in-progress state, and the
  operation status reaches a ready terminal state once the worktree exists

#### Scenario: Duplicate create for the same worktree and branch is idempotent

- **WHEN** a create is requested for a `<repo-id>/<wt-id>` whose operation is already in-flight or
  succeeded, **for the same exact (case-sensitive) branch** recorded in that operation's metadata
- **THEN** the existing operation is returned rather than starting a second create, and only one
  worktree is produced

#### Scenario: A same-id collision across different branches is surfaced at the operation boundary

- **WHEN** a create is requested whose `<repo-id>/<wt-id>` matches an existing in-flight or
  succeeded operation but whose **exact (case-sensitive) branch differs** from the branch recorded
  in that operation's metadata (a truncated-hash collision forced at the orchestrator/API level)
- **THEN** the orchestrator does not reuse or alias the existing operation; it surfaces the **same
  typed collision error** raised by the create requirement at the operation boundary, and no second
  worktree is created

#### Scenario: Concurrent creates of different worktrees in one repo serialize their git writes

- **WHEN** two creates for different worktrees in the same repository run concurrently
- **THEN** each is its own operation, their git mutations to the shared bare repository are
  serialized by the per-repository lock, and both worktrees are produced without corrupting git's
  worktree administrative state

#### Scenario: Abort cancels and cleans up without removing a completed worktree

- **WHEN** an in-flight worktree create is aborted
- **THEN** the operation transitions to aborted, the partial worktree directory is removed and
  pruned, and if the create had already completed when the abort was handled the completed
  worktree is preserved (a single terminal transition under the per-key lock, gated on the
  completion check)

#### Scenario: Interrupted create is reconciled on restart

- **WHEN** the server restarts and the ledger holds a `worktree` operation marked `running` whose
  process is no longer alive
- **THEN** that operation is reconciled to `failed`, its partial worktree is cleaned, and the
  worktree is not listed

### Requirement: List a repository's worktrees with git-derived status

The system SHALL list a repository's worktrees by reading git's worktree records, returning for
each worktree its `<wt-id>`, its exact branch name, its relative path, and a git-status summary
(whether it has uncommitted changes, and whether it is up-to-date, ahead, behind, or diverged from
its upstream); a directory that git does not report as a worktree, or whose `<wt-id>` does not
match the derivation of its branch, MUST NOT be listed.

#### Scenario: Worktrees are listed with their branch and status

- **WHEN** a repository's worktrees are listed
- **THEN** each worktree appears with its `<wt-id>`, its exact branch name, its path, and a
  git-status summary (dirty/clean and up-to-date/ahead/behind/diverged)

#### Scenario: A foreign or mismatched directory is ignored

- **WHEN** a directory under `worktrees/` is not a git-registered worktree, or its `<wt-id>` does
  not match the identifier derived from its branch
- **THEN** it does not appear in the worktree list

### Requirement: Delete a worktree, gated by safe-to-delete criteria

The system SHALL delete a worktree by removing only that worktree's checkout (via git worktree
removal and pruning) and its directory at `~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>`,
never the bare repository, another worktree, or the git branch; deletion MUST be guarded by a
server-side re-check of the safe-to-delete predicate — a worktree is safe to delete only when it
has no active Claude session, its pull request is merged, and it has no uncommitted changes — and
an unsafe deletion MUST be refused unless an explicit force flag is supplied. Because the
pull-request-merged input has **no data source in the MVP** (the PR lamp is display-only), the
auto-safe (non-force) path is fully specified but **dormant in the MVP**: with no merged-PR signal
no worktree is ever auto-classified safe, so a worktree with no merged PR (including one with no PR
at all) is **not auto-safe** and **every MVP deletion is confirmation-gated** through the force
flag. The criteria remain fully specified and the delete path remains fully usable; the auto-safe
path becomes reachable, with no further specification change, once a PR-status source supplies the
merged-PR input.

#### Scenario: A safe worktree is deleted, leaving the bare clone and siblings intact

- **WHEN** a worktree that is idle, whose PR is merged, and that has no uncommitted changes is
  deleted
- **THEN** that worktree's directory is removed and pruned, and the bare repository and all other
  worktrees in the repository are unaffected

#### Scenario: Deletion never removes the branch

- **WHEN** a worktree is deleted
- **THEN** only the worktree checkout is removed; the underlying git branch (local and remote) is
  not deleted

#### Scenario: An unsafe deletion is refused

- **WHEN** deletion is requested for a worktree that is not safe to delete (it has an active
  session, its PR is not merged, or it has uncommitted changes) and no force flag is supplied
- **THEN** the deletion is refused with a typed not-safe error and no directory is removed

#### Scenario: A forced deletion proceeds

- **WHEN** deletion is requested with an explicit force flag
- **THEN** the worktree is removed even though it is not safe to delete

#### Scenario: A delete refuses a path git does not manage as a worktree

- **WHEN** deletion is requested (including with the force flag) for a structurally valid `<wt-id>`
  whose on-disk path is a normal directory that git does not report as a worktree under this
  repository's worktrees root (a user's directory, or any directory git never registered)
- **THEN** the delete establishes git-registration of the target **before any filesystem removal**,
  refuses the request with a typed not-managed/not-found error, and removes nothing — the force flag
  bypasses git's safe-to-delete check but never the registration requirement, so a forced delete can
  never remove an arbitrary directory git did not manage; and the directory removal honors the
  result of git's worktree removal rather than unconditionally deleting the path afterward

#### Scenario: Session-liveness and PR-merged inputs degrade safely

- **WHEN** the safe-to-delete predicate is evaluated and no session-liveness or PR-status source
  is wired (sessions and PR data are owned by other changes)
- **THEN** the predicate treats the worktree as having no active session and as having an
  unmerged PR by default, so a worktree is not considered safe to delete on those terms until the
  inputs are supplied

#### Scenario: In the MVP every deletion is confirmation-gated because the auto-safe path is dormant

- **WHEN** a deletion is requested in the MVP, where no PR-status source is wired and the
  merged-PR input is therefore false for every worktree
- **THEN** no worktree is ever auto-classified safe, so the deletion proceeds only via the explicit
  force flag (the confirmation-gated path), removing only the worktree checkout, and the auto-safe
  (non-force) path is unreachable until a PR-status source is supplied

#### Scenario: A worktree with no merged pull request is not auto-safe

- **WHEN** the safe-to-delete predicate is evaluated for a worktree that has no associated merged
  PR (whether its PR is unmerged or it has no PR at all)
- **THEN** the worktree is classified as not auto-safe, and its deletion requires the explicit
  force flag (confirmation)

### Requirement: Worktree API routes, typed client, and contract

The API SHALL expose worktree create, list, delete, and status routes that validate their input
with Zod against the shared schemas (invalid input → `422`, handler not invoked) and report the
shared operation/worktree response shapes; the typed client MUST expose a matching method for each
route so that schema drift fails the contract test at build time.

#### Scenario: Routes validate input and reject malformed requests

- **WHEN** a worktree route is called with input that fails its Zod schema (e.g. a malformed
  `<repo-id>` or an empty branch)
- **THEN** the request is rejected with `422` and the handler is not invoked

#### Scenario: Typed client mirrors every worktree route

- **WHEN** the typed client is built against the server's route types
- **THEN** it exposes a create, list, delete, and status method whose request/response types match
  the shared schemas, and any drift breaks the contract test

### Requirement: Worktrees-hub screen states

The web app SHALL provide the worktrees-hub worktree surface — the per-repository worktree
sections — and MUST specify its list, empty, loading, and error states, the create-worktree modal,
and the delete control. The create-worktree modal MUST let the user choose an existing remote
branch or a new branch (with a base-branch selector) and enable Create only for valid input; the
delete control MUST reflect the safe-to-delete predicate (presented as safe only when the worktree
is safe to delete) and confirm before a destructive removal — and because the merged-PR input has
no data source in the MVP, the safe (lit) styling is **dormant in the MVP** and the control MUST
always confirm before removing; the surface MUST adapt to mobile and desktop.

#### Scenario: Worktrees render with their git lamp

- **WHEN** a repository with worktrees is shown in the hub
- **THEN** each worktree renders as a section with its branch, its plug, and a git-status lamp
  reflecting the worktree's git status

#### Scenario: Empty repository offers add-worktree only

- **WHEN** a cloned repository has no worktrees
- **THEN** the repository card shows the "Add worktree…" affordance and no worktree sections

#### Scenario: Create-worktree modal validates before Create enables

- **WHEN** the user opens the create-worktree modal and chooses an existing remote branch or a new
  branch with a base
- **THEN** the input is validated and Create is enabled only for a valid branch selection

#### Scenario: Delete control reflects the safe-to-delete predicate

- **WHEN** a worktree is safe to delete (idle, PR merged, no uncommitted changes)
- **THEN** the delete control is presented as safe (the lit styling), and triggering it confirms
  before removing the worktree; otherwise the control is presented as not-safe and a removal is
  guarded/refused

#### Scenario: The safe (lit) styling is dormant in the MVP

- **WHEN** the worktrees-hub delete control is rendered in the MVP, where no PR-status source is
  wired
- **THEN** no worktree reaches the safe (lit) styling, the control is presented as not-safe for
  every worktree, and triggering it always requires confirmation before removal

### Requirement: No branch name, identifier, path, or PAT leaks from worktree operations

The system SHALL ensure that worktree operations never leak sensitive values: the branch name, the
`<wt-id>` (whose slug can echo the branch), absolute filesystem paths, git command arguments, and
the GitHub PAT MUST NOT appear in telemetry spans, logs, or process arguments, and any PAT used
for a remote fetch MUST be supplied only through the credential helper.

#### Scenario: Worktree telemetry is redacted

- **WHEN** telemetry is emitted for a worktree create, list, or delete
- **THEN** no span or log contains the branch name, the `<wt-id>` or its slug, an absolute
  filesystem path, the git command arguments, or the PAT

#### Scenario: A remote fetch supplies the PAT only via the credential helper

- **WHEN** creating a worktree for an existing remote branch requires fetching from the remote
- **THEN** the PAT is supplied only through the credential helper and does not appear in process
  arguments, the clone/remote URL, or logs
