## ADDED Requirements

### Requirement: Session liveness and listing derive from tmux truth

The system SHALL determine whether a worktree has a live session, and list a repository's live
sessions, **from tmux as the source of truth** — by forward-deriving each candidate session name from
its `(repo-id, wt-id)` and testing existence, never by decoding a tmux name back into a branch —
reporting **existence and worktree mapping only**. It MUST NOT track or return conversation metadata
(model, context usage, last message, history), which is the mobile app's domain. The candidate set is
the repository's **existing** worktrees; a session whose worktree has been deleted (an orphan) cannot
be forward-derived and is therefore **out of scope** of the listing (manual cleanup — a known
limitation). `session-list` serves exactly the per-worktree plug liveness and the safe-to-delete
`SessionProbe` seam below — nothing more.

#### Scenario: A worktree with a live tmux session is listed as on

- **WHEN** a repository's sessions are listed and a worktree's derived session name is live in tmux
- **THEN** that worktree is reported as having a live session, mapped to its `(repo-id, wt-id)`

#### Scenario: A worktree with no tmux session is not reported as live

- **WHEN** a repository's sessions are listed and a worktree's derived session name is not live in
  tmux
- **THEN** that worktree is reported as having no live session

#### Scenario: Listing reports existence and mapping only

- **WHEN** the session list is returned
- **THEN** each entry carries only the worktree mapping and a liveness/status indicator, and no
  conversation metadata (model, context, last message) is present

#### Scenario: Liveness derives forward and never decodes a tmux name

- **WHEN** liveness is evaluated for a `(repo-id, wt-id)`
- **THEN** the session name is derived forward from the pair and existence is tested; a tmux session
  name is never parsed back into a branch or worktree identity

### Requirement: Provide the session-liveness source for worktree safe-to-delete

The system SHALL provide a tmux-backed session-liveness probe implementing the
`hasActiveSession(repoId, wtId)` seam that `worktree-management` consumes, and MUST wire it into the
worktree orchestrator in place of the default no-session probe, so that a worktree with a live session
is reported as having an active session (not idle) by the safe-to-delete predicate. The probe MUST
depend only on tmux and the derived session name (no back-dependency on the worktree orchestrator, so
no dependency cycle is introduced).

#### Scenario: The wired probe reports a live-session worktree as active

- **WHEN** the safe-to-delete predicate evaluates a worktree whose derived session name is live in
  tmux, with the real probe wired
- **THEN** `hasActiveSession` returns true for that worktree, so its idle term is false

#### Scenario: A worktree with a live session is not safe to delete on the idle term

- **WHEN** a worktree has a live session and a non-force deletion is attempted
- **THEN** the safe-to-delete predicate treats it as not idle and the deletion is refused (the active
  session blocks the idle term), independent of the PR-merged term

#### Scenario: A worktree with no session reports no active session

- **WHEN** the probe is queried for a worktree whose derived session name is not live in tmux
- **THEN** `hasActiveSession` returns false (no active session), matching the seam's degrade-safe
  default

### Requirement: Session list API, typed client, and contract

The API SHALL expose a session-list route (per repository) that validates its input with Zod — a
malformed `<repo-id>` MUST be rejected with `422` and the handler MUST NOT be invoked — and returns
existence and worktree mapping only; the typed client MUST expose a matching method so that schema
drift fails the contract test at build time.

#### Scenario: The list route rejects a malformed repo-id

- **WHEN** the session-list route is called with a malformed `<repo-id>`
- **THEN** the request is rejected with `422` and the handler is not invoked

#### Scenario: The list returns live sessions with their worktree mapping

- **WHEN** the session-list route is called for a repository with live sessions
- **THEN** it returns those sessions' worktree mappings and liveness, and nothing else

#### Scenario: Typed client mirrors the session-list route

- **WHEN** the typed client is built against the server's route types
- **THEN** it exposes a session-list method whose request/response types match the shared schemas, and
  any drift breaks the contract test

### Requirement: The plug reflects session status on the worktrees hub

The web app SHALL drive each worktree's plug **status** from the session-liveness data on the existing
worktrees hub: **off** (no live session), **starting** (a launch is in flight), **on** (a live
session), and **error** (a launch or stop failed); it MUST NOT provide a standalone session screen,
and the displayed status MUST self-correct from tmux truth on the next liveness read after an external
change.

#### Scenario: The plug renders off and on from liveness

- **WHEN** a worktree has no live session, then later has one
- **THEN** its plug renders off, then on, driven by the liveness data

#### Scenario: The plug renders starting while a launch is in flight

- **WHEN** a launch for a worktree is in flight (not yet settled)
- **THEN** its plug renders the transient starting state and is guarded against action

#### Scenario: The plug renders error on a failed launch

- **WHEN** a worktree's launch operation resolved to a typed error
- **THEN** its plug renders the error state

#### Scenario: The plug status self-corrects from tmux truth

- **WHEN** a worktree's session was killed outside Switchboard and the hub re-reads liveness
- **THEN** its plug updates to off, reflecting tmux truth rather than a stale settled operation
