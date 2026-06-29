## ADDED Requirements

### Requirement: Resolve a live session's cloud bridge session id

The system SHALL resolve, for a live session, the **cloud bridge session id** that backs a
`https://claude.ai/code/<id>` link, by looking up the session's **recorded launch UUID** (the
`--session-id` value `session-launch` records in the operation ledger) in claude's per-session state
(`~/.claude/sessions/*.json`) and returning that entry's `bridgeSessionId` — **only** when it is
present and matches the strict token shape `^session_[A-Za-z0-9]+$`. The match MUST be by the recorded
launch UUID, **never** by the worktree path (`cwd`), so a stale state file left by a prior launch in
the same worktree cannot be mismatched. Resolution is **best-effort and never load-bearing for
liveness** (which remains tmux-derived per `session-list`): an unresolved bridge id yields *no link*,
never an error and never a change to the reported session status.

#### Scenario: A live session with a matching, well-formed state entry resolves its bridge id

- **WHEN** a live session's recorded launch UUID matches a per-session state entry whose
  `bridgeSessionId` is present and matches `^session_[A-Za-z0-9]+$`
- **THEN** that `bridgeSessionId` is returned for the session

#### Scenario: A live session with no matching entry resolves to no link

- **WHEN** a live session has no per-session state entry for its recorded launch UUID (none recorded,
  or the bridge has not connected yet)
- **THEN** no bridge id is returned and the session is reported live with no link, with liveness
  unaffected

#### Scenario: The match is by recorded UUID, not by worktree path

- **WHEN** two per-session state entries share the worktree's `cwd` — one stale from a prior launch
  and one for the current session — and only one carries the session's recorded launch UUID
- **THEN** the entry matching the recorded UUID is used and the stale entry is ignored

#### Scenario: A malformed bridge token is rejected

- **WHEN** a matched state entry's `bridgeSessionId` does not match `^session_[A-Za-z0-9]+$`
- **THEN** no bridge id is returned (no link) and the malformed value is never surfaced to the client

### Requirement: Bridge-id resolution is bounded and degrades observably

The system SHALL resolve bridge ids over **at most one scan of `~/.claude/sessions/` per liveness
poll** — building a single `sessionId → bridgeSessionId` index that every live session in the listing
is resolved against, never one scan per session. The scan MUST be **explicitly bounded**: it inspects
at most the **newest N state files by modification time** (the live sessions are the recent ones) and
within a **deadline**, and any entries beyond that bound are simply not read (those sessions get no
link). Each inspected file is parsed and Zod-validated with a **tolerant** schema that **ignores
unknown/extra fields**: an entry whose **required** fields are valid still resolves even when the file
gains new unknown fields (additive Claude-state drift MUST NOT break resolution). The resolver
**skips** malformed or oversized files rather than failing the listing, and emits **structured
telemetry** only on a genuine degradation — a parse error, a **missing or invalid required field**, a
malformed/invalid `bridgeSessionId`, or a scan that hit the bound. Because the state file is
undocumented internal Claude Code state, a **breaking** format change MUST surface as an observable
signal rather than a silent feature-wide disappearance of links; the documented non-support behaviour
is *no affordance plus telemetry*. The bounded scan MUST NOT delay or alter tmux-derived liveness.

#### Scenario: The scan is bounded to the newest N files within a deadline

- **WHEN** `~/.claude/sessions/` contains far more than N state files (many stale/unrelated) and a
  repository's sessions are listed
- **THEN** at most the newest N files (by mtime) are read within the deadline, the listing returns
  promptly without scanning every entry, and any live session whose state file fell outside the bound
  gets no link plus telemetry — liveness unaffected

#### Scenario: Additive drift (an unknown extra field) still resolves

- **WHEN** a live session's matching state entry gains an **unknown extra field** but its required
  fields (`sessionId`, a brand-valid `bridgeSessionId`) remain valid
- **THEN** the bridge id still resolves (the unknown field is ignored) and no degradation telemetry is
  emitted

#### Scenario: A missing or invalid required field degrades to no link and emits telemetry

- **WHEN** a live session's matching state entry is missing a **required** field or has one of the
  wrong type
- **THEN** that session degrades to no link, structured telemetry records the degradation, and the
  session's tmux-derived liveness is unaffected

#### Scenario: A malformed or oversized file is skipped without failing the listing

- **WHEN** an inspected state file is unparseable JSON or exceeds the per-file size guard
- **THEN** it is skipped (with telemetry), the listing still returns, and other valid entries still
  resolve

### Requirement: The listing contract carries an optional branded bridge session id

The session-summary contract returned by the session-list route SHALL include an **optional**
`bridgeSessionId` field **branded** to the strict shape `^session_[A-Za-z0-9]+$`, populated only when
resolved and validated, and absent otherwise; the validation MUST apply at both the resolver output
and the shared schema, and the typed client/contract test MUST cover the field so schema drift fails
the contract test at build time. The server MUST NOT place any value that fails the brand into the
field.

#### Scenario: A resolved session carries the branded id; an unresolved one omits it

- **WHEN** the session list is returned for a repository with one bridge-resolved live session and one
  unresolved live session
- **THEN** the resolved session's summary carries a `bridgeSessionId` matching the brand and the
  unresolved session's summary omits the field

#### Scenario: Schema drift on the field breaks the contract test

- **WHEN** the typed client is built against the server's route types and the `bridgeSessionId` shape
  drifts from the shared schema
- **THEN** the contract test fails at build time

### Requirement: The worktrees hub surfaces an "open in Claude web" deep link

The web app SHALL render, **adjacent to a live session's plug** on the worktrees hub, an "open in
Claude web" affordance that deep-links to `https://claude.ai/code/<bridgeSessionId>` (composed
client-side) and opens in a new tab with `rel="noopener"`, carrying an accessible name. The affordance
MUST be present **only** when the session's `bridgeSessionId` is known, and absent for an `off`,
`starting`, or `error` plug and for a live session whose bridge id has **not yet resolved**. The
affordance MUST appear on the next liveness read after the bridge id becomes resolvable, without a
reload, and MUST NOT block, gate, or alter the plug's launch/stop action.

#### Scenario: A live, bridge-resolved session shows the link beside its plug

- **WHEN** a worktree's session is live and its `bridgeSessionId` is known
- **THEN** an "open in Claude web" link is rendered adjacent to that worktree's plug, targeting
  `https://claude.ai/code/<bridgeSessionId>` in a new tab with an accessible name

#### Scenario: A live session without a resolved bridge id shows no link

- **WHEN** a worktree's session is live but its `bridgeSessionId` is not yet known
- **THEN** no "open in Claude web" affordance is rendered for that worktree

#### Scenario: Off, starting, and error sessions show no link

- **WHEN** a worktree's plug is `off`, `starting`, or `error`
- **THEN** no "open in Claude web" affordance is rendered for that worktree

#### Scenario: The link appears on the next liveness read after the bridge connects

- **WHEN** a live session's bridge id becomes resolvable and the hub re-reads liveness
- **THEN** the "open in Claude web" link appears for that worktree without a reload
