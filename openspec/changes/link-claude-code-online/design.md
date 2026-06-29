## Context

Switchboard launches each worktree's session as `claude --remote-control` detached in tmux
(`orchestrator.ts:41`, `CLAUDE_LAUNCH_COMMAND`), tracked as a `session`-typed ledger operation keyed
`session/<repo-id>/<wt-id>`; liveness is always re-derived from tmux (`session-list`). Because the
session is already remote-control-bridged, claude writes a per-session state file
`~/.claude/sessions/<pid>.json` carrying `{ sessionId (local UUID), cwd, status, bridgeSessionId }`,
where `bridgeSessionId` (`session_…`) is the cloud id behind a `https://claude.ai/code/<id>` link —
a different namespace from the local `--session-id` UUID, so it must be retrieved, never synthesised
(plan Decision 1). This change reads that bridge id back and surfaces an "open in Claude web"
affordance, threading an optional field through the existing session-list slice. Constraints: the
state file is **undocumented internal state**; telemetry redaction is a **hard rule** (no paths,
branch names, argv, or tokens in plain span attributes — `server/CLAUDE.md`); liveness must stay
tmux-authoritative.

## Goals / Non-Goals

**Goals:**

- Resolve a live session's cloud bridge id and expose it as an optional, branded contract field.
- Render a one-click "open in Claude web" deep link beside a live session's plug, present only once
  the bridge id is known.
- Contain the fragile dependency: bounded, validated, degrade-to-no-link with observable telemetry.

**Non-Goals:**

- No change to conversation lifecycle (still a fresh conversation per launch) or to tmux-derived
  liveness.
- No scraping of the tmux pane's printed URL (plan Decision 2 — rejected fallback).
- No resume-on-relaunch (plan Decision 4); no conversation metadata in the listing (`session-list`).
- Promoting the prototype into production stories is `tasks.md` work, not this design.

## Decisions

1. **Join key = ledger record `metadata.sessionId`.** `launchSession` generates
   `uuid = crypto.randomUUID()` and passes `metadata: { sessionId: uuid }` to `ledger.start({type:
'session', key, metadata, run})`. The ledger stores `metadata` on a **new** record only, so the
   idempotency semantics give the behaviour for free: a duplicate in-flight launch reuses the record
   (and its UUID → one session), while a relaunch after stop is a new operation with a **new** UUID
   (fresh conversation, plan Decision 4). The **external-kill path is covered too**: when a
   `succeeded` session record is stale (tmux marker gone), `ledger.start` falls through and writes a
   **fresh record with the passed metadata** (`ledger.ts:205-219`, gated by `reuseRequiresMarker` +
   `isComplete`), so a relaunch after an external kill records a *different* `metadata.sessionId` —
   the resolver never matches a dead session. This is asserted by a test, not assumed (see Testing
   strategy). The resolver reads it back via
   `ledger.get(sessionKey(repoId, wtId))?.metadata?.sessionId`. No new persistence, no
   `resolver → ledger` edge (plan Decision 5): `sessionService` owns the ledger read and passes the
   UUID into the pure resolver.

2. **Composable argv builder.** Replace the `CLAUDE_LAUNCH_COMMAND` constant with
   `buildLaunchArgv({ sessionId }): string[]` → `['claude', '--session-id', sessionId,
'--remote-control']`. A unit test asserts both flags are present and that adding/reordering other
   flags keeps `--session-id` — the enforceable form of the `name-sessions` coordination (plan
   Decision 10). The argv stays redacted under the blocklisted `session.argv` span key.

3. **Resolver = bounded I/O reader + pure lookup.** Two pieces in one module
   (`session-link-resolver.ts`):
   - `readSessionStateIndex(deps)` does **one** bounded scan of the sessions dir per call. The scan
     is bounded by **newest-N-by-mtime + a deadline** (live sessions are the recent files): `readdir`
     + `stat`, take the newest N entries within the time budget, and leave the rest unread (those
     sessions get no link + a `scan-bounded` telemetry signal). Each inspected file gets a per-file
     size guard, `readFile` + `JSON.parse` + Zod-validate against a **tolerant** schema
     (`{ sessionId, bridgeSessionId?, … }`, `.passthrough()` so **unknown fields are ignored** —
     additive Claude-state drift still resolves). It **skips** malformed/oversized files and emits
     structured telemetry (reason code + count) **only on genuine degradation**: a parse error, a
     **missing/invalid required field**, a bad `bridgeSessionId` token, or hitting the scan bound —
     **not** on a merely unknown extra field. Returns `Map<sessionId, bridgeSessionId>` where the
     value passed the brand.
   - The pure lookup: for a live session's recorded UUID, return the indexed `bridgeSessionId` or
     `undefined`. Match is by UUID only, never `cwd` (plan Decision 5/7).
     The sessions dir (`join(homedir(), '.claude', 'sessions')`) is an injectable dependency so tests
     point it at a fixtures dir; `readdir`/`readFile`/`stat` go through an injectable fs seam.

4. **`listSessions` enrichment.** After collecting live sessions, build the index **once**, then for
   each live session read its recorded UUID from the ledger and attach the resolved
   `bridgeSessionId?` to the `SessionSummary`. One scan per `listSessions` call (≈ one per 4 s poll),
   not one per session (plan Decision 7).

5. **Branded contract field.** Add `bridgeSessionId: z.string().regex(/^session_[A-Za-z0-9]+$/).brand('BridgeSessionId').optional()`
   to `sessionSummarySchema` in `packages/shared`. The brand is validated at both the resolver
   output and the schema; the `contract.ts` compile-time guard + the typed client carry it so drift
   fails the contract test. The **web** composes `https://claude.ai/code/${bridgeSessionId}` — the
   server stays agnostic to claude.ai's URL shapes (plan Decision 6).

6. **Web affordance (placement A — prototype `claude-web-link.stories.tsx`).** Promote the
   prototype's `ClaudeWebLink` (an `<a target="_blank" rel="noopener">` styled like the catalogue
   `IconButton`, patina accent, external-link glyph) into the sessions slice and render it in
   `WorktreeRow` **immediately right of the `Plug`** (the chosen placement keeps a benign navigation
   action away from the destructive delete control). It renders only when `bridgeSessionId` is
   present; `session-model`/`session-queries` carry the optional id from the list response. The
   affordance never gates the plug's launch/stop action.

7. **Telemetry honours redaction.** Degradation telemetry emits a **reason code** from the explicit
   breaking-case set — `missing-or-invalid-required-field` | `bad-token` | `parse-error` |
   `size-limit` | `scan-bounded` — and a count only. There is **no** generic `schema-drift` reason
   (an additive/unknown field is tolerated and emits nothing — Decision 3); the codes match the
   `session-web-link` degradation triggers one-for-one. Any file path or id, if ever attached, goes
   under a blocklisted `session.*` key; the bridge token is never placed in a plain span attribute —
   it legitimately appears only in the client-rendered `href`.

## Testing strategy

**Unit (server):**

- `session-link-resolver.test.ts` (new) against a **fixtures dir** of sample `<pid>.json` files:
  a valid+matching entry → bridge id resolved; a non-matching UUID → none; **two entries sharing a
  `cwd`, one stale** → the UUID-matched one wins; a malformed-token entry → rejected (no link); a
  malformed/oversized JSON file → skipped, listing unaffected; an **unknown extra field** with valid
  required fields → **still resolves, no telemetry** (additive drift tolerated); a **missing/invalid
  required field** → degrades + telemetry asserted; **more than N files / past the deadline** → only
  the newest-N inspected and overflow sessions get no link + `scan-bounded` telemetry. The fs seam +
  injectable sessions dir are the only new harness pieces.
- `orchestrator.test.ts` (extend, real ledger over a temp workspace + fake `TmuxRunner`): a launch
  records `metadata.sessionId`; a relaunch after stop records a **different** UUID; a relaunch after
  an **external tmux kill** (stale `succeeded` record) records a **different** UUID; `listSessions`
  attaches the resolved `bridgeSessionId` (resolver stubbed/fixtured) and omits it when unresolved.
- `buildLaunchArgv` test: composes `--session-id`/`--remote-control`; the drop-guard invariant.

**Unit (shared):** the branded `bridgeSessionId` schema accepts `session_…`, rejects a UUID / empty
/ wrong shape; the `contract.ts` guard covers the new field.

**Unit (web):** extend `WorktreesView`/`session-plug` tests — the link renders for a live+resolved
session (correct `href`, `target=_blank`, accessible name), and is absent for off/starting/error and
live-but-unresolved. Promote the prototype into a real story under `src/sessions/` with these as
story-level assertions.

**E2E (optional, lightweight):** a launch path that asserts a `--session-id` UUID reaches the state
file's `sessionId` (closes plan Open Q2) — gated behind the real `claude`, so kept out of the default
unit run.

**Harness gap:** minimal. The only new infrastructure is (a) a **state-file fixture set** (valid /
stale-shared-cwd / malformed / drifted) and (b) an **injectable sessions dir + fs seam** on the
resolver. The orchestrator's temp-workspace ledger + fake-tmux harness already exists; shared has its
contract test; web has Storybook + vitest + Playwright. These become the leading "Test
infrastructure" task group.

## Risks / Trade-offs

- **[Undocumented state-file format drifts across Claude Code versions]** → tolerant `.passthrough()`
  schema so **additive** drift (a new unknown field) still resolves; only **breaking** drift (a
  missing/invalid required field) degrades to no link with telemetry; fixture tests pin **both** modes
  separately; all format knowledge in one module.
- **[Container/remote runtime may not mount `~/.claude/sessions`]** (interaction with
  `runtime-cli-docker`) → resolver degrades to no link best-effort; liveness unaffected. Noted, not
  blocking.
- **[Telemetry leaking the bridge token or a path]** → reason-code+count only; paths/ids under
  blocklisted `session.*` keys; token never in a plain attribute.
- **[`name-sessions` rebase silently drops `--session-id`]** → shared argv builder + drop-guard test
  (Decision 2).
- **[Scan cost under a large/old sessions dir]** → bounded by **newest-N-by-mtime + a deadline**,
  per-file size guard, malformed files skipped; overflow degrades to no link + `scan-bounded`
  telemetry without delaying liveness — covered by an overflow test.
- **[Stale ledger record without `metadata.sessionId`]** (e.g. a session launched outside Switchboard
  or pre-dating this change) → no recorded UUID ⇒ no link (never a `cwd` guess); acceptable, the
  affordance simply does not appear.

## Open Questions

- **Plan Open Q1/Q2 (bridge-id timing; UUID lands in state file):** resolved by design as best-effort
  (link appears on a later poll) and closed empirically by the optional E2E above during TDD — no
  code timing dependency.
- **Dev-doc destination** for the internal-file dependency + degradation contract is fixed in
  `docs-migration.md` (next artifact).
