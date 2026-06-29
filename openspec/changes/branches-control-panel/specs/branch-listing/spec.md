## ADDED Requirements

### Requirement: Enumerate a repository's local and remote branches with a six-state status

The system SHALL list, for a cloned repository, every local branch and every remote (`origin`)
branch, and for each branch derive exactly one status from the set {`local-only`, `synced`,
`ahead`, `diverged`, `remote-ahead`, `remote-only`}. The status MUST be computed from the bare
clone's `refs/heads/*` and `refs/remotes/origin/*` by joining branches on name and comparing
commits (merge-base / ahead-behind counts) — it MUST NOT rely on `%(upstream:track)` alone, which a
bare clone leaves empty because its local heads carry no upstream configuration. Each listed branch
MUST report whether it currently has a worktree, and when it does MUST carry the worktree fields the
home section consumes as its **single data source** — at least the worktree's `<wt-id>`, its dirty
flag, and its path — so the section renders a branch row and evaluates the delete predicate without
also querying the worktree list.

#### Scenario: A local branch with no remote counterpart is local-only

- **WHEN** a branch has a local `refs/heads` ref but no `refs/remotes/origin` counterpart
- **THEN** it is listed with status `local-only`

#### Scenario: Local and remote present are classified by commit comparison

- **WHEN** a branch exists both locally and on `origin`
- **THEN** it is listed as `synced` when the two refs point at the same commit, `ahead` when the
  local ref is strictly ahead, `remote-ahead` when the local ref is strictly behind, and `diverged`
  when each side has commits the other lacks

#### Scenario: A remote branch with no local ref is remote-only

- **WHEN** a branch exists on `origin` with no local `refs/heads` ref (it has never been checked out
  locally)
- **THEN** it is listed with status `remote-only`

#### Scenario: A branch with a worktree carries its worktree fields

- **WHEN** a listed branch has a worktree under this repository
- **THEN** the branch summary reports that it has a worktree and includes that worktree's fields
  (`<wt-id>`, dirty flag, and path); a branch with no worktree reports no worktree and omits those
  fields

#### Scenario: A local branch whose upstream is gone is treated as local-only

- **WHEN** a local branch's configured upstream no longer exists on `origin` (a `gone` upstream)
- **THEN** it is listed with status `local-only` (Phase 1 makes no distinct "upstream gone" state)

### Requirement: A best-effort repo-wide fetch keeps the remote branch list fresh

The system SHALL, as part of enumerating branches, perform a best-effort repo-wide `git fetch
origin` that first ensures the `+refs/heads/*:refs/remotes/origin/*` refspec is configured — a bare
clone configures none, so `refs/remotes/origin/*` is otherwise empty and remote-only branches are
undiscoverable. The fetch MUST be best-effort: an unreachable or unauthenticated remote, or any
failed fetch, leaves the last-known remote-tracking refs in place and the listing still returns
rather than failing. The listing MUST surface a freshness/error indication so the UI can show that
the remote view may be stale.

#### Scenario: First enumeration on a fresh bare clone discovers remote branches

- **WHEN** branches are enumerated for a repository whose bare clone has never had a worktree
  created (so `refs/remotes/origin/*` is empty and no fetch refspec is configured)
- **THEN** the refspec is configured and a fetch populates `refs/remotes/origin/*`, so remote-only
  branches appear in the listing

#### Scenario: An unreachable remote degrades to last-known refs

- **WHEN** branches are enumerated while `origin` is unreachable or unauthenticated
- **THEN** the listing still returns using the last-known remote-tracking refs and reports a stale /
  fetch-error indication, rather than failing the request

#### Scenario: The fetch supplies the PAT only via the credential helper

- **WHEN** the repo-wide fetch authenticates to `origin`
- **THEN** the PAT is supplied only through the credential helper and never appears in process
  arguments, the remote URL, or logs

### Requirement: Branch-listing API route, typed client, and contract

The API SHALL expose a branch-listing route that validates its input with Zod against the shared
branch schemas (invalid input → `422`, handler not invoked) and returns the branch summaries — each
carrying the branch name, its six-state status, its has-worktree flag and, when present, its worktree
fields (`<wt-id>`, dirty, path), plus the listing's freshness/`stale` indication. The branch summary
schema MUST reserve an **optional**
`prStatus` field that the `pr-indicators` change populates, so adding it later is non-breaking. The
typed client MUST expose a matching method so schema drift fails the contract test at build time.

#### Scenario: The route validates input and rejects malformed requests

- **WHEN** the branch-listing route is called with a malformed `<repo-id>`
- **THEN** the request is rejected with `422` and the handler is not invoked

#### Scenario: The typed client mirrors the route

- **WHEN** the typed client is built against the server's route types
- **THEN** it exposes a branch-listing method whose request/response types match the shared schemas,
  and any drift breaks the contract test

#### Scenario: The branch summary reserves an optional PR-status field

- **WHEN** the shared branch summary schema is defined
- **THEN** it includes an optional `prStatus` field that Phase 1 never populates, so the
  `pr-indicators` change can fill it without a breaking schema change

### Requirement: Branch listing never leaks branch names or the PAT

The system SHALL ensure branch enumeration never leaks sensitive values: branch names, absolute
filesystem paths, git command arguments, and the PAT MUST NOT appear in telemetry spans or logs
(span attributes prefer counts over names), and the PAT MUST be supplied only through the credential
helper.

#### Scenario: Branch-listing telemetry is redacted

- **WHEN** telemetry is emitted for a branch listing
- **THEN** no span or log contains a branch name, an absolute path, the git command arguments, or
  the PAT — branch counts may be recorded, names may not
