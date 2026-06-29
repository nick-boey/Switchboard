## MODIFIED Requirements

### Requirement: Launch a Claude session detached in a worktree's tmux session

The system SHALL launch `claude` with **Remote Control enabled** (`--remote-control`) **detached in a
tmux session rooted at the worktree's checkout** (`~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>`),
so the session survives the request and the official Claude mobile app (and Claude Code on the web) can
drive it. The launch command MUST be assembled by a **single composable argv builder** and passed as
**argv** (never a shell line), MUST include a **`--session-id <uuid>`** flag carrying a **fresh
random UUID v4 generated per launch** (preserving today's new-conversation-per-launch behaviour), MUST
rely on the host's existing `claude` login (no per-session pairing UI), and MUST require an existing
worktree. The launch MUST **record the assigned UUID in the session operation's ledger record** so it
can later serve as the exact join key for resolving the session's cloud bridge id
(`session-web-link`). A launch that is **not** an idempotent reuse of an in-flight operation —
**including a relaunch after the prior session was killed externally** (the stale-`succeeded`-record
reconcile) — MUST generate and record a **fresh** UUID, so the recorded join key always reflects the
live session and never a dead one. The argv builder MUST compose `--session-id` and `--remote-control`
together and remain extensible for additional launch flags, so that neither flag can be silently
dropped.

#### Scenario: A launch starts a detached tmux session rooted at the worktree

- **WHEN** a session is launched for an existing worktree
- **THEN** a detached tmux session is created with its working directory set to that worktree's
  checkout path, running `claude` with `--remote-control` enabled

#### Scenario: The launch command is argv, not a shell line

- **WHEN** a session is launched for a worktree whose branch (and therefore path/name) contains
  adversarial characters
- **THEN** the command and the worktree path are passed as argv to tmux, with no shell interpolation
  of the path or the session name

#### Scenario: The session rides the host's existing login

- **WHEN** a session is launched
- **THEN** no per-session pairing or remote-control auth step is performed; the launch relies on the
  host's existing `claude` login

#### Scenario: A fresh session UUID is assigned and recorded per launch

- **WHEN** a session is launched, and later the same worktree is relaunched after a stop
- **THEN** each launch passes a distinct, freshly generated `--session-id` UUID and records that UUID
  in its session operation ledger record (so the two launches are distinct conversations, each with
  its own join key)

#### Scenario: Relaunch after an external kill records a fresh UUID

- **WHEN** a session's launch has settled `succeeded`, its tmux session is then killed outside
  Switchboard (so liveness reads `off`), and the worktree is relaunched
- **THEN** the stale `succeeded` record is not reused; the fresh launch creates a new tmux session
  **and** records a new, different `metadata.sessionId`, so the bridge-id resolver matches the live
  session and never the dead one

#### Scenario: The argv builder composes the session-id and remote-control flags

- **WHEN** the launch argv is built
- **THEN** it contains both `--session-id <uuid>` and `--remote-control`, and a change that added or
  reordered other launch flags would still keep `--session-id` present (asserted by the builder's
  test)
