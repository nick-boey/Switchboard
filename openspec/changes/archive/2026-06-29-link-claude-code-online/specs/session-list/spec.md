## MODIFIED Requirements

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
