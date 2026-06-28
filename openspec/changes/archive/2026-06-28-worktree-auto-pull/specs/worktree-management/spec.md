## ADDED Requirements

### Requirement: Refresh a local branch from its remote, fast-forward-only and best-effort

The system SHALL provide a reusable operation that brings a single local branch up to date with
its remote by fetching `origin` and fast-forwarding the local branch ref to its remote-tracking
counterpart; the refresh MUST be **fast-forward-only** — a divergent local branch (one holding
commits not on the remote) is left exactly as-is, never reset, rebased, or otherwise made to
discard local-only commits — and **best-effort** — an unreachable remote, authentication failure,
or any failed fetch leaves the local branch at its current tip and does NOT fail the caller. The
operation MUST be invocable independently of worktree creation, so the same operation backs both
automatic refresh-on-create and a future manually-triggered refresh. It MUST NOT leak sensitive
values: the branch name, the worktree id or its slug, absolute filesystem paths, and git command
arguments MUST NOT appear in telemetry spans or logs, and the PAT MUST NOT appear in process
arguments, the remote URL, or logs and MUST be supplied only through the credential helper. (Git
necessarily receives branch refs such as `refs/heads/<branch>` and `origin/<branch>` as its own
arguments; the requirement is about telemetry, logs, and the PAT — not about hiding ref names from
git itself.)

#### Scenario: A fast-forwardable branch is brought up to date

- **WHEN** the refresh runs for a local branch whose remote-tracking counterpart has advanced and
  the local branch can fast-forward to it (no local-only commits)
- **THEN** the local branch ref is fast-forwarded to the fetched remote tip, so a subsequent read
  of that branch sees the latest remote commits

#### Scenario: A divergent local branch is left intact

- **WHEN** the refresh runs for a local branch that has commits not present on the remote (it has
  diverged from its remote-tracking counterpart)
- **THEN** the refresh does not fast-forward, the local branch ref and its local-only commits are
  left unchanged, and the operation reports success/no-op without raising

#### Scenario: An unreachable remote is tolerated best-effort

- **WHEN** the refresh runs but the fetch from `origin` fails (the remote is unreachable, the
  caller is offline, or authentication fails)
- **THEN** the operation does not throw to its caller, the local branch is left at its current tip,
  no branch name, worktree id, absolute path, or git command argument appears in telemetry or logs,
  and the PAT is never placed in process arguments, the remote URL, or logs

#### Scenario: The refresh can be invoked independently of worktree creation

- **WHEN** the branch refresh is invoked directly (not as part of a worktree create)
- **THEN** it performs the same fast-forward-only, best-effort refresh for the named branch, so the
  identical guarantee can later back a manual trigger without duplicating the logic

## MODIFIED Requirements

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
the idempotent path, not a collision. Before building the checkout, the create MUST bring the
branch the checkout will be based on up to date with the remote — the **base** branch for a new
branch, or the **existing local branch** for a branch that already exists on the remote — by
applying the fast-forward-only, best-effort branch refresh; a divergent local branch is left intact
and an unreachable remote falls back to the existing local tip so the create still succeeds
offline. (The path that creates a branch fresh from `origin/<branch>` when no local branch yet
exists is already up to date by construction and needs no separate refresh.)

#### Scenario: Worktree lands at the canonical path on a branch

- **WHEN** a worktree is created for a valid cloned repository and branch
- **THEN** a working tree exists at `~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>` checked
  out on that branch, alongside (not replacing) the bare repository at `.bare`

#### Scenario: A fast-forwardable existing remote branch is checked out at the latest remote tip and tracked

- **WHEN** a worktree is created for a branch that already exists on the remote and the local branch
  can fast-forward to the fetched remote tip (it has no local-only commits)
- **THEN** the worktree checks out that existing branch at the latest remote tip — the local branch
  is fast-forwarded from `origin` before the checkout is built — and is set to track the remote
  branch

#### Scenario: A diverged existing remote branch checks out the unchanged local tip and tracks

- **WHEN** a worktree is created for a branch that already exists on the remote but the local branch
  has diverged — it holds commits not on the remote, so it cannot fast-forward
- **THEN** the fast-forward-only refresh leaves the local branch unchanged, the worktree checks out
  that local tip (it is never reset or rebased to the remote tip, so local-only commits are
  preserved), the create does not fail, and the worktree is still set to track the remote branch

#### Scenario: New branch is created from a base

- **WHEN** a worktree is created requesting a new branch
- **THEN** the base (defaulting to the repository's default branch) is first refreshed from
  `origin`, then a new branch is created from that up-to-date base and checked out in the new
  worktree, so the new branch starts from the latest remote tip of its base

#### Scenario: A worktree is not created from a stale local base

- **WHEN** the remote has advanced beyond the local copy of the branch (for an existing remote
  branch) or of the base (for a new branch), and a worktree is created for it
- **THEN** the worktree's checkout includes the latest remote commits and is not behind `origin`,
  because the relevant branch was fetched and fast-forwarded before the worktree was built

#### Scenario: A divergent base is preserved when creating a new branch

- **WHEN** a new-branch worktree is created and the base branch has local-only commits not on the
  remote (it has diverged), so it cannot fast-forward
- **THEN** the fast-forward-only refresh leaves the base and its local-only commits unchanged, the
  create does not fail, and the new branch is cut from that local base tip

#### Scenario: Worktree creation still succeeds when the remote is unreachable

- **WHEN** a worktree is created while the remote is unreachable, so refreshing the branch from
  `origin` fails
- **THEN** the create proceeds best-effort from the existing local branch tip rather than failing,
  and the refresh attempt leaks no branch name, worktree id, absolute path, or git command argument
  into telemetry or logs and never places the PAT in process arguments, the remote URL, or logs

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
