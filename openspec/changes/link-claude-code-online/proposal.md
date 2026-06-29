## Why

Switchboard already launches every session with `claude --remote-control`, so each one is bridged to
Claude Code on the web — but there is no way to jump from Switchboard into the live session in the
browser or mobile app (GitHub issue #5). The `session_…` id behind a `https://claude.ai/code/<id>`
link is the **cloud bridge session id**, a different namespace from the local `--session-id` UUID, so
it cannot be synthesised up front; it must be retrieved from claude's per-session state and surfaced
as a one-click "open in Claude web" affordance.

## What Changes

- **Assign a per-launch session UUID as a join key.** The launch command becomes
  `claude --session-id <uuid> --remote-control`, built by a **composable argv builder**, with a fresh
  random UUID per launch (preserving today's new-conversation-per-launch behaviour). The UUID is
  recorded in the session operation ledger record so it can be looked up later.
- **Resolve the cloud bridge session id (new server component).** A **pure** `sessionLinkResolver`
  takes a live session's recorded launch UUID (read by `sessionService` from the ledger), looks it up
  in a **single bounded per-poll index** built over claude's per-session state files
  (`~/.claude/sessions/*.json`), and returns that entry's `bridgeSessionId` — only if it matches the
  strict `/^session_[A-Za-z0-9]+$/` token shape. The state file is **undocumented internal Claude
  Code state**: each file is Zod-validated with a **tolerant** schema — an **unknown/additive field is
  ignored and the session still resolves (no telemetry)** — and the resolver **degrades to no link
  with structured telemetry** only on a **breaking** change (a missing/invalid required field, a bad
  bridge token, a parse/size failure, or hitting the scan bound), so a breaking format change surfaces
  as a signal rather than a silent feature-wide outage. The read is **never load-bearing for liveness**
  (which stays tmux-derived). The scan is bounded by **newest-N-by-mtime + a deadline**.
- **Carry the bridge id through the listing contract.** Add an optional, branded `bridgeSessionId` to
  the per-session summary returned by the session-list route; populated only once the bridge has
  connected and the token validates.
- **Surface the affordance (web).** On the worktrees hub, a live session's plug gains an **"open in
  Claude web"** deep link to `https://claude.ai/code/<bridgeSessionId>` (composed client-side). The
  affordance is **absent until** the bridge id is known, appearing on the next 4 s liveness poll after
  the bridge connects.
- **Coordinate the launch argv with the parallel `name-sessions` branch** via the shared argv builder
  and a test asserting `--session-id`/`--remote-control` (and the `-n/--name` flag) compose, so a
  rebase cannot silently drop the resolver's only exact join key.

No breaking changes — every addition is optional and additive; when no bridge id is resolvable the UI
is exactly as it is today.

## Capabilities

### New Capabilities

- `session-web-link`: Resolve a live session's cloud bridge session id from claude's per-session state
  (bounded, validated, degrade-with-telemetry) and surface a one-click "open in Claude web" deep link
  on the worktrees hub. Owns the new optional `bridgeSessionId` contract field, the
  `sessionLinkResolver` component, and the hub affordance.

### Modified Capabilities

- `session-launch`: The launch command is assembled by a composable argv builder and includes
  `--session-id <uuid>` (a fresh random UUID per launch); the assigned UUID is recorded in the
  `session`-typed ledger record as the bridge-id resolver's exact join key.
- `session-list`: The listing — previously "existence and worktree mapping only … MUST NOT return
  conversation metadata" — is widened to permit the optional `bridgeSessionId` (session **identity /
  deep-link** data, explicitly not conversation metadata, best-effort and degradable), supplied by
  `session-web-link`.

## Impact

- **Shared** (`packages/shared/src/sessions.ts`): add a branded `bridgeSessionId`
  (`/^session_[A-Za-z0-9]+$/`) as an optional field on the session-summary schema; contract test
  covers it.
- **Server** (`apps/server/src/sessions/`): new `session-link-resolver.ts` (pure resolver + bounded
  per-poll scan + Zod schema for `~/.claude/sessions/*.json` + degradation telemetry + fixture/drift
  tests); `orchestrator.ts` assigns the UUID, records it in the ledger, and enriches `listSessions`
  with resolved bridge ids; a composable launch-argv builder replaces the inline
  `['claude','--remote-control']` constant. Degradation telemetry emits through the existing
  `observability` setup (no new observability requirements).
- **Web** (`apps/web/src/sessions/` + worktrees hub): `session-queries`/`session-model` carry the
  optional bridge id; the hub renders the "open in Claude web" affordance beside the plug, composing
  the `claude.ai/code/<id>` URL.
- **UI surface touched:** the worktrees hub (per-worktree plug area). Prototypes under
  `src/prototypes/link-claude-code-online/` will explore the link/icon placement beside the plug, its
  absent/disabled state before a bridge id exists, hover/label, and how it reads on the mobile-first
  layout.
- **External dependency:** the undocumented `~/.claude/sessions/<pid>.json` format and its
  `bridgeSessionId` field — contained behind the resolver, validated, observable on drift.
- **Coordination:** the `name-sessions` branch edits the same launch argv; the shared argv builder +
  compose test absorb the conflict (no `dependencies.md` edge — `name-sessions` is not an active
  OpenSpec change here).
