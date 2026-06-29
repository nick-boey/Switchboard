# session-list Specification

## Purpose
TBD - created by archiving change claude-session-launch. Update Purpose after archive.
## Requirements
### Requirement: Session liveness and listing derive from tmux truth

The system SHALL determine whether a worktree has a live session, and list a repository's live
sessions, **from tmux as the source of truth** — by forward-deriving each candidate session name from
its `(repo-id, wt-id)` and testing existence, never by decoding a tmux name back into a branch —
reporting **existence, worktree mapping, and (when resolved) an optional cloud bridge session id**
only. The optional bridge session id is **session identity / deep-link data** supplied best-effort by
`session-web-link`, is **never load-bearing for liveness**, and is **not** conversation metadata: the
listing MUST NOT track or return conversation metadata (model, context usage, last message, history),
which is the mobile app's domain. The candidate set is the repository's **existing** worktrees; a
session whose worktree has been deleted (an orphan) cannot be forward-derived and is therefore **out
of scope** of the listing (manual cleanup — a known limitation). `session-list` serves exactly the
per-worktree plug liveness, the safe-to-delete `SessionProbe` seam below, the web app's aggregate
header live-session count, and the per-session "open in Claude web" link (`session-web-link`) —
nothing more.

#### Scenario: A worktree with a live tmux session is listed as on

- **WHEN** a repository's sessions are listed and a worktree's derived session name is live in tmux
- **THEN** that worktree is reported as having a live session, mapped to its `(repo-id, wt-id)`

#### Scenario: A worktree with no tmux session is not reported as live

- **WHEN** a repository's sessions are listed and a worktree's derived session name is not live in
  tmux
- **THEN** that worktree is reported as having no live session

#### Scenario: Listing reports existence, mapping, and at most an optional bridge id — no conversation metadata

- **WHEN** the session list is returned
- **THEN** each entry carries the worktree mapping, a liveness/status indicator, and at most an
  optional resolved bridge session id, and no conversation metadata (model, context, last message) is
  present

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
existence, worktree mapping, and an **optional** resolved bridge session id (`session-web-link`) only;
the typed client MUST expose a matching method so that schema drift fails the contract test at build
time.

#### Scenario: The list route rejects a malformed repo-id

- **WHEN** the session-list route is called with a malformed `<repo-id>`
- **THEN** the request is rejected with `422` and the handler is not invoked

#### Scenario: The list returns live sessions with their worktree mapping and any resolved bridge id

- **WHEN** the session-list route is called for a repository with live sessions
- **THEN** it returns those sessions' worktree mappings and liveness, plus an optional bridge session
  id for any session whose bridge id has resolved, and nothing else

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

### Requirement: The header reflects the aggregate live-session count

The web app SHALL display, in the application header, a live-session count that equals the
**aggregate** number of live sessions across all cloned repositories, derived from the same
per-repository session-liveness data that drives the per-worktree plug — and it MUST NOT render
a constant placeholder (such as `0`) when sessions are live. The header count MUST self-correct
from tmux truth on the next liveness read (the same liveness data the worktrees hub re-reads), so
that a session started or killed outside the header's own actions is reflected without a reload, and
the header indicator MUST render its **on** state when the aggregate is greater than zero and its
**off** state when it is zero.

#### Scenario: The header count is non-zero when sessions are live (regression)

- **WHEN** one or more cloned repositories have live sessions and the header is rendered from the
  session-liveness data
- **THEN** the header live-session count equals the total number of live sessions, not a constant
  `0`, and the header indicator renders its **on** state

#### Scenario: The header count aggregates across repositories

- **WHEN** live sessions exist in more than one cloned repository
- **THEN** the header count equals the sum of the live-session counts across every cloned
  repository

#### Scenario: The header count is zero when no session is live

- **WHEN** no cloned repository has a live session
- **THEN** the header live-session count is `0` and the header indicator renders its **off** state

#### Scenario: The header count self-corrects from tmux truth

- **WHEN** the underlying per-repository liveness data changes (for example a session is killed
  outside Switchboard) and the header re-reads that liveness data
- **THEN** the header count updates to the new aggregate — decreasing when sessions end — reflecting
  tmux truth rather than a stale value

