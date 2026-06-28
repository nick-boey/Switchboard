## MODIFIED Requirements

### Requirement: Session liveness and listing derive from tmux truth

The system SHALL determine whether a worktree has a live session, and list a repository's live
sessions, **from tmux as the source of truth** — by forward-deriving each candidate session name from
its `(repo-id, wt-id)` and testing existence, never by decoding a tmux name back into a branch —
reporting **existence and worktree mapping only**. It MUST NOT track or return conversation metadata
(model, context usage, last message, history), which is the mobile app's domain. The candidate set is
the repository's **existing** worktrees; a session whose worktree has been deleted (an orphan) cannot
be forward-derived and is therefore **out of scope** of the listing (manual cleanup — a known
limitation). `session-list` serves exactly the per-worktree plug liveness, the safe-to-delete
`SessionProbe` seam below, and the web app's aggregate header live-session count — nothing more.

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

## ADDED Requirements

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
