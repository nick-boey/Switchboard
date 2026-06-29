# session-launch Specification

## Purpose
TBD - created by archiving change claude-session-launch. Update Purpose after archive.
## Requirements
### Requirement: Launch a Claude session detached in a worktree's tmux session

The system SHALL launch `claude --remote-control` **detached in a tmux session rooted at the
worktree's checkout** (`~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>`), so the session
survives the request and the official Claude mobile app can drive it. The launched session SHALL be
**named after its repository and branch slug** — `<repo>/<branch-slug>`, where `<repo>` is the
repository name and `<branch-slug>` is the `<wt-id>` with its trailing `--<hash>` suffix removed
(e.g. repo `acme/widget-factory` + `<wt-id>` `name-sessions--7130389dc45a` →
`widget-factory/name-sessions`) — passed to `claude` on both naming surfaces it exposes via the
exact argv `['claude', '--remote-control=<name>', '--name', '<name>']`: the `--name` display name and
the Remote Control session name. The Remote Control name MUST use the `--remote-control=<name>`
equals form — `--remote-control` takes an *optional* value, so a space-separated token would not bind
and the session would fall back to its auto-generated name. With the name on both surfaces the
session is identifiable by repo and branch in Claude's Remote Control list, the `/resume` picker, and
the terminal title. The name SHALL be a deterministic, forward-only function of `(repo-id, wt-id)` —
including the repository **name** so the same branch in two differently-named repositories stays
distinct (the owner is not folded in, so two same-named repositories under different owners produce
the same name, an accepted collision) — and MUST NOT read or pass the exact git branch (which stays
sensitive). The derived name is itself sensitive (it embeds the branch-derived slug) and MUST appear
in telemetry only under redacted (blocklisted) attribute keys, never unredacted. The launch command
and the derived name MUST be passed as argv (never a shell line), MUST rely on the host's existing
`claude` login (no per-session pairing UI), and MUST require an existing worktree.

#### Scenario: A launch starts a detached tmux session rooted at the worktree

- **WHEN** a session is launched for an existing worktree
- **THEN** a detached tmux session is created with its working directory set to that worktree's
  checkout path, running `claude --remote-control` named after the worktree's repo and branch slug

#### Scenario: The launched session is named after its repo and branch slug

- **WHEN** a session is launched for `(repo-id, wt-id)` whose `<wt-id>` is `<slug>--<hash>` (e.g.
  repo `acme/widget-factory`, `<wt-id>` `name-sessions--7130389dc45a`)
- **THEN** the argv passed to tmux is `['claude', '--remote-control=<repo>/<slug>', '--name', '<repo>/<slug>']`
  (e.g. `<repo>/<slug>` = `widget-factory/name-sessions` — the repository name and the `<wt-id>` with
  the trailing `--<hash>` removed), carrying the name on both naming surfaces: the `--name` display
  name and the Remote Control session name
- **AND** the Remote Control name uses the `--remote-control=<name>` equals form, never a
  space-separated `['--remote-control', '<name>']` — `--remote-control` takes an *optional* value that
  a space-separated token would not bind, leaving the session auto-named
- **AND** the name is derived forward from `(repo-id, wt-id)` only; the exact git branch is never read
  or passed

#### Scenario: The same branch in differently-named repositories yields distinct session names

- **WHEN** two worktrees in repositories with different repository names share the same branch (and
  therefore the same `<wt-id>`, since `<wt-id>` is a function of the branch alone)
- **THEN** their launched Claude session names differ, because the name includes the repository name,
  not the `<wt-id>` alone

#### Scenario: Worktrees that resolve to the same `<repo>/<slug>` share a name (accepted, deterministic)

- **WHEN** two distinct worktrees resolve to the same `<repo>/<slug>` — either two same-named
  repositories under **different owners** (e.g. `acme/widget` and `other/widget`, since the owner is
  not folded into the name), or two worktrees in one repository whose slugs coincide (case-folding
  branch pairs, or branches whose long names slugify to the same length-capped value)
- **THEN** the same name is produced for both — the name is a deterministic function of
  `(repo-id, wt-id)`, and residual disambiguation beyond `<repo>/<slug>` (the dropped owner and hash)
  is intentionally out of scope for this fix

#### Scenario: The launch command and derived name are argv, not a shell line

- **WHEN** a session is launched for a worktree whose **exact branch** contains adversarial
  characters (which `idForBranch` still maps to a safe, path-safe `<wt-id>`, and whose `<repo-id>` is
  validated)
- **THEN** the derived `<repo>/<slug>` session name, the launch command, and the worktree path are
  passed as argv to tmux, with no shell interpolation of the name, the path, or the command

#### Scenario: The derived session name never escapes telemetry unredacted

- **WHEN** a session launch emits telemetry spans
- **THEN** the derived `<repo>/<slug>` session name — like the tmux session name, the worktree path,
  the `<wt-id>`, its slug, and the exact branch — appears only under redacted (blocklisted) attribute
  keys and never as an unredacted attribute value

#### Scenario: The session rides the host's existing login

- **WHEN** a session is launched
- **THEN** no per-session pairing or remote-control auth step is performed; the launch relies on the
  host's existing `claude` login

### Requirement: tmux session names reuse the canonical path-safe scheme

The system SHALL name each tmux session by a deterministic, pure function of the worktree's
`<repo-id>` and `<wt-id>` that **reuses the canonical path-safe slug-plus-hash primitives** (the same
`slugForBranch` and SHA-256 used by `idForBranch`) — not a parallel naming scheme and never a raw
`sb-<repo>-<branch>` — producing a tmux-safe name (no `.`, `:`, `/`, or whitespace) carrying a fixed
`sb-` prefix, collision-resistant across distinct `(repo-id, wt-id)` pairs.

#### Scenario: The same branch in different repos yields distinct session names

- **WHEN** two worktrees in different repositories share the same branch name (and therefore the same
  `<wt-id>`)
- **THEN** their derived tmux session names differ, because the name is a function of `(repo-id,
  wt-id)`, not of `<wt-id>` alone

#### Scenario: The same worktree always yields the same session name

- **WHEN** the session name is derived for the same `(repo-id, wt-id)` more than once
- **THEN** the same name is produced every time (deterministic)

#### Scenario: The derived name is tmux-safe

- **WHEN** a session name is derived from a `(repo-id, wt-id)` whose slug would contain a reserved
  character (`.`)
- **THEN** the derived name contains no `.`, `:`, `/`, or whitespace and is a valid tmux session name

#### Scenario: Names are derived forward, never decoded

- **WHEN** the system needs the session name for a known `(repo-id, wt-id)`
- **THEN** it derives the name forward from the pair; it never parses a tmux session name back into a
  branch or worktree identity

### Requirement: Launch is a tracked, idempotent operation through the ledger and lock

The system SHALL run a launch as a tracked `session`-typed operation through the operation ledger and
per-key lock, keyed in a namespace **distinct from the worktree-create operation's key**, so that
duplicate or concurrent launch requests for the same worktree resolve to a **single** session, the
launch exposes a transient in-progress (starting) status, and a launch failure resolves to a typed
error outcome that leaves no live session. Session **liveness MUST always be re-derived from tmux**,
never inferred from the ledger record alone. A settled `succeeded` launch record whose tmux session no
longer exists (e.g. killed outside Switchboard) is **stale** and MUST NOT be reused for idempotency:
the launch MUST re-check the tmux marker before reuse and, when the marker is absent, start a fresh
launch operation that creates a NEW tmux session.

#### Scenario: A duplicate launch reuses the in-flight operation

- **WHEN** a launch is requested for a worktree whose launch operation is already in flight
- **THEN** the existing operation is reused and only one tmux session is created

#### Scenario: The launch operation key does not collide with the worktree-create key

- **WHEN** a session launch and a worktree-create operation exist for the same `(repo-id, wt-id)`
- **THEN** they occupy distinct ledger records (distinct keys) and neither aliases the other

#### Scenario: A failed launch reports a typed error and leaves no live session

- **WHEN** the tmux launch subprocess fails (e.g. tmux missing, or `claude` cannot start)
- **THEN** the launch operation resolves to a typed error outcome (no 500), and no live tmux session
  remains for that worktree

#### Scenario: Liveness comes from tmux, not the ledger record

- **WHEN** a launch operation has settled successfully but its tmux session was subsequently killed
  outside Switchboard
- **THEN** the worktree's session is reported as off (liveness re-derived from tmux), regardless of
  the settled ledger record

#### Scenario: Relaunch after an external kill creates a new tmux session

- **WHEN** a session's launch operation has settled `succeeded`, its tmux session is then killed
  outside Switchboard (so the plug reads off), and the user activates the plug to start again
- **THEN** the stale `succeeded` record is not reused; the launch re-checks the tmux marker, finds it
  absent, and creates a NEW detached tmux session for that worktree

### Requirement: Stop a session (teardown)

The system SHALL stop a session by killing its tmux session, after which the worktree reports no
active session; stopping is the user's explicit action, is **idempotent** (stopping an already-absent
session is a successful no-op), and MUST NOT remove the worktree or its branch. A worktree
force-deleted while its session is live MUST NOT be auto-killed by the delete path (which this change
does not own); the resulting tmux orphan is **not** surfaced by the session listing (which lists
existing worktrees only) and requires manual cleanup — a known limitation.

#### Scenario: Stopping a live session kills it and flips liveness to off

- **WHEN** a stop is requested for a worktree with a live session
- **THEN** the tmux session is killed and the worktree subsequently reports no active session

#### Scenario: Stopping an absent session is a no-op success

- **WHEN** a stop is requested for a worktree that has no live session
- **THEN** the request succeeds with no error and nothing is changed

#### Scenario: A force-deleted worktree's session is not auto-killed

- **WHEN** a worktree with a live session is force-deleted (the worktree-management delete path)
- **THEN** the session is not auto-killed by the delete; the resulting tmux orphan is not surfaced by
  the session listing and requires manual cleanup

### Requirement: Session lifecycle mutations serialize on the per-session boundary

The system SHALL serialize **all** session lifecycle mutations for a worktree — launch, stop, and any
stale-record reconcile — on the **same per-session boundary** (the per-session operation key
`session/<repo-id>/<wt-id>`), so a launch and a stop for the same session are mutually exclusive and
MUST NOT interleave. A stop MUST drain (await the settlement of) any in-flight launch for that session
by awaiting `ledger.whenSettled(key)` **with the per-session lock released**, and MUST perform the
tmux kill **while holding** that lock. A stop MUST NOT await launch settlement while holding the
per-session lock: doing so deadlocks, because the launch worker settles its terminal state only after
it reacquires that same lock, so the awaited settlement could never occur. Because the launch worker
spawns its tmux session outside that lock, a stop MUST re-drain and retry (a drain-then-lock loop) if,
on taking the lock, a launch operation for the key is still in flight (`pending`/`running`) — so a
launch that registers between the drain and the lock cannot strand a live session. After the
serialized mutations complete, liveness MUST be re-derived from tmux (authoritative) and the resulting
state MUST equal the effect of the last lifecycle action; for a launch racing a stop the resulting
state MUST be `off` (stop wins).

#### Scenario: A launch racing a stop does not strand a live session

- **WHEN** a launch and a stop are requested concurrently for the same worktree
- **THEN** they serialize on the per-session boundary (the stop drains the in-flight launch before
  killing), and the outcome is deterministic: the launch operation settles `succeeded`, the session is
  killed, and tmux confirms the final liveness is off — never a stop that killed nothing while a launch
  later left a surviving session

#### Scenario: A stop racing a duplicate launch leaves one well-defined outcome

- **WHEN** a stop is requested while two duplicate launches for the same worktree are in flight
- **THEN** the duplicate launches collapse to a single launch operation (idempotent) that settles
  `succeeded`, and the drained stop kills the one session created, so the final liveness is off and no
  second/orphaned session remains

#### Scenario: A stop draining an in-flight launch does not deadlock and ends off

- **WHEN** a stop begins after a launch has already spawned the worktree's tmux session but **before**
  the launch worker has reached its terminal ledger write
- **THEN** the stop drains the launch by awaiting settlement **with the per-session lock released** (so
  the worker can reacquire the lock and settle — the stop does **not** hang), then kills the session
  under the lock, and the launch operation settles `succeeded` while the final liveness re-derived from
  tmux is off (no live session remains)

### Requirement: Session API routes, typed client, and contract

The API SHALL expose launch, stop, and launch-status routes that validate their input with Zod
against the shared schemas — a malformed `<repo-id>` or `<wt-id>` MUST be rejected with `422` and the
handler MUST NOT be invoked — and the typed client MUST expose a matching method for each route so
that schema drift fails the contract test at build time.

#### Scenario: Routes validate input and reject malformed requests

- **WHEN** a session route is called with input that fails its Zod schema (a malformed `<repo-id>` or
  `<wt-id>`)
- **THEN** the request is rejected with `422` and the handler is not invoked

#### Scenario: Typed client mirrors every session route

- **WHEN** the typed client is built against the server's route types
- **THEN** it exposes a launch, stop, and launch-status method whose request/response types match the
  shared schemas, and any drift breaks the contract test

### Requirement: The session plug action on the worktrees hub

The web app SHALL make the existing per-worktree plug **actionable** on the worktrees hub: activating
an off plug MUST request a launch, activating a live plug MUST request a stop, and a transient
(starting/stopping) plug MUST be guarded against action. The MVP MUST NOT provide a standalone
session-list or launch screen (the plug is the session affordance) and MUST NOT show a post-launch
toast or handoff instructing the user to open the Claude mobile app.

#### Scenario: Activating an off plug launches a session

- **WHEN** the user activates a worktree's plug while it is off
- **THEN** a launch is requested for that worktree

#### Scenario: Activating a live plug stops the session

- **WHEN** the user activates a worktree's plug while it is on
- **THEN** a stop is requested for that worktree's session

#### Scenario: A transient plug is guarded

- **WHEN** a worktree's plug is in a transient (starting/stopping) state
- **THEN** activating it triggers no launch or stop

#### Scenario: No standalone session screen and no launch handoff

- **WHEN** the worktrees hub is shown and a session is launched
- **THEN** there is no standalone session-list or launch screen, and no toast/handoff instructing the
  user to open the Claude mobile app is displayed

### Requirement: Session launch telemetry redaction

The system SHALL treat the tmux session name, the worktree path, the `(repo-id, wt-id)`, and the
launch command/argv as sensitive: they MUST appear only under blocklisted (redacted) span attribute
keys, never as plain attributes, and subprocess stderr MUST NOT be logged.

#### Scenario: Session spans carry sensitive values only under redacted keys

- **WHEN** a launch or stop emits telemetry spans
- **THEN** the session name, worktree path, `(repo-id, wt-id)`, and launch argv appear only under
  redacted attribute keys and never as plain span attributes, and no subprocess stderr is logged

