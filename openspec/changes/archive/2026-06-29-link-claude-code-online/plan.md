# Plan: link-claude-code-online

<!-- Created during the planning interview (/switch-plan). The durable record of why this
     change exists and what architectural shape was agreed. -->

## Problem

Switchboard launches each worktree's Claude Code session with `claude --remote-control`
(`sessionService`), so every session is **already** bridged to Claude Code on the web. But there is
no way to jump from Switchboard's UI into the live session in the browser / mobile app. GitHub
issue #5 asks whether the `session_…` id in a `https://claude.ai/code/session_…` link is a UUID we
can inject via `claude --session-id <UUID>`. The answer (proven during planning) is **no** — that id
lives in a different namespace from the local session UUID — so a self-generated GUID can never
*be* the web URL; the cloud id must be **retrieved**. We want a one-click "open in Claude web"
affordance per live session.

## Architecture summary

Reference slice: `Switchboard.Api.sessionService` launches `claude --remote-control` detached in a
tmux session; `Switchboard.Api.sessionProbe` derives liveness; `Switchboard.WebSPA` lists sessions
via the typed Hono RPC client and renders the header live-session count + per-session Plug. This
change extends that slice end-to-end:

- **Launch (server):** add `--session-id <uuid>` to the launch argv — a fresh random UUID per launch
  — and record it in the session operation ledger record as a stable, exact join key.
- **Resolve (server):** add `Switchboard.Api.sessionLinkResolver`, a narrow **pure** component
  (mirroring `sessionProbe`) that takes the launch UUID as **input** — `sessionService` reads the
  recorded UUID from the operation ledger and passes it in, so the resolver has no ledger dependency
  — builds **one bounded index** over claude's per-session state files (`~/.claude/sessions/*.json`)
  per poll, and returns the matching entry's `bridgeSessionId` (the cloud id behind
  `claude.ai/code/<id>`).
- **Contract (shared):** add an optional, **branded** `bridgeSessionId` to `sessionSummarySchema`
  (strict `/^session_[A-Za-z0-9]+$/` token shape); populated by `sessionService.listSessions` only
  once the bridge has connected and the token validates.
- **UI (web):** `Switchboard.WebSPA` renders an "open in Claude web" affordance per live session
  linking to `https://claude.ai/code/<bridgeSessionId>` — a new `WebSPA -> ClaudeBackplane`
  deep-link edge. The affordance appears on the next 4 s liveness poll after the bridge connects.

Fragility is contained in the resolver: `~/.claude/sessions/<pid>.json` is undocumented internal
Claude Code state, so each file is Zod-validated with a **tolerant** schema. **Additive drift** (an
unknown extra field) is **tolerated** — the session still resolves, no telemetry — and the resolver
degrades to **no link with structured telemetry** only on a **breaking** change (a missing/invalid
required field, a bad bridge token, a parse/size failure, or hitting the scan bound). This split is
pinned by fixture tests covering **both** drift modes, so a breaking format change (e.g. after a
Claude Code update) is observable rather than invisible while liveness still reports healthy. The scan
is bounded by **newest-N-by-mtime + a deadline**.

## Plan page

None — this plan.md is the complete plan. (Single, self-contained change; no multi-change
programme.)

## Planned architecture

File: `docs/dev/Architecture/Planned/link-claude-code-online.c4` (validates: `✓ Valid (5 files)`).

Elements added:

- `Switchboard.Api.sessionLinkResolver` (component, `#todo`)

Relationships added (all `#todo`):

- `Switchboard.Api.sessionService -> Switchboard.Api.sessionLinkResolver`
- `Switchboard.Api.sessionLinkResolver -> TmuxHost`
- `Switchboard.WebSPA -> ClaudeBackplane`

Views added:

- `link-claude-code-online-api` (of `Switchboard.Api`)
- `link-claude-code-online-flow` (of `Switchboard`)

(The `--session-id` launch flag refines the existing `sessionService -> TmuxHost` edge — a behaviour
detail, not a new element — so it is not separately modelled. There is deliberately **no**
`sessionLinkResolver -> operationLedger` edge: the join-key lookup stays on the existing
`sessionService -> operationLedger` edge and the resolver receives the UUID as input — see Decision
5.)

## Decisions

1. **The `claude.ai/code/<id>` id is the cloud "bridge" session id, not the local `--session-id`
   UUID.** Proven empirically: this very session's local UUID `42ec9f7f-…` maps to
   `bridgeSessionId: "session_011M7D8EPisCss4xNqQ4PNiQ"` in `~/.claude/sessions/<pid>.json`, and that
   token is exactly its `claude.ai/code/…` link. Issue #5's `016iJ8uvtLucRZJ8hiAqpeor` is a 24-char
   base62 token, **not** a UUID. ⇒ The bridge id must be **retrieved** (the user's Option A); a
   GUID-up-front scheme (Option B) is impossible because the web URL never equals the local UUID.

2. **Source = `~/.claude/sessions/<pid>.json`** (fields used: `sessionId`, `cwd`, `status`,
   `bridgeSessionId`). Chosen over scraping the tmux pane's printed URL — structured JSON beats
   parsing terminal output.

3. **Hybrid join key.** Launch with `claude --session-id <uuid> --remote-control` and match the
   state file by `sessionId === <uuid>`. Exact and unambiguous, vs. matching by `cwd` (which collides
   with stale state files left in the same worktree path).

4. **Fresh conversation per launch.** The UUID is random per launch (`crypto.randomUUID`), recorded
   in the session operation ledger record. Preserves today's behaviour (each launch = a new
   conversation), keeps the feature purely additive, and makes the join key globally unique so stale
   `<pid>.json` files never collide. *Rejected:* deterministic UUID v5 / resume-on-relaunch — it
   reintroduces stale-file ambiguity and depends on unverified `--session-id` resume semantics.

5. **Resolver/ledger boundary — `sessionService` owns the lookup; the resolver is pure.**
   *(Codex Architecture review, high #1.)* `sessionService` reads the recorded launch UUID via its
   existing `-> operationLedger` edge and passes it into a **pure** `sessionLinkResolver` that is a
   function of `(launchSessionId, state-file index)`. There is deliberately **no
   `resolver -> operationLedger` edge** — the join-key dependency stays on `sessionService`, keeping
   the resolver narrow and the boundary explicit in the `.c4`. Restart/missing-metadata behaviour:
   if no ledger record holds the UUID for a live session (server restart, session launched outside
   Switchboard), the resolver yields **no link** (never a guessed/`cwd` match) — see Open question 3.

6. **Degradation is observable, not silent — and additive drift is tolerated.** *(Codex Architecture
   review high #2; Artifacts review #1.)* The resolver Zod-validates each state file with a
   **tolerant** schema: an **unknown/additive field is ignored and the session still resolves (no
   telemetry)** — so an additive Claude-state change never breaks links. It returns **no link with
   structured telemetry** only on a **breaking** change: a missing/invalid **required** field, a
   malformed `bridgeSessionId` token, a parse/size failure, or hitting the scan bound. The
   file-format knowledge is contained in one module; the read is **never load-bearing for liveness**
   (which stays tmux-derived). Behaviour is pinned by **both** drift-mode tests (unknown-field →
   resolves; missing/invalid-required → degrades), so a *breaking* Claude-Code-update format change
   surfaces as a signal rather than a feature-wide UI absence. The documented **non-support path** is
   "no affordance + telemetry"; the tmux-pane-scrape fallback stays **rejected** (Decision 2 — a
   second fragile source is worse than an observed null).

7. **Bounded lookup — one index per poll, newest-N + deadline.** *(Codex Architecture review medium
   #3; Artifacts review #3.)* The resolver scans `~/.claude/sessions/` **once per liveness poll**,
   building a `sessionId → bridgeSessionId` index that all of a repo's live sessions are resolved
   against (not one scan per session). `~/.claude/sessions/` is outside Switchboard's lifecycle and
   accumulates stale/unrelated files, so the scan is **explicitly bounded** to the **newest N entries
   by mtime within a deadline** (live sessions are the recent ones), with per-file size/parse guards
   and malformed files skipped; entries past the bound are unread (those sessions get no link +
   `scan-bounded` telemetry, liveness unaffected). Covered by an overflow test (more files than N).
   Keeps a repo listing from degrading into unbounded fs + Zod work.

8. **Contract — branded, validated token.** *(Codex Architecture review, medium #4.)* Add optional
   `bridgeSessionId` to `sessionSummarySchema` in `packages/shared` as a **branded** type with a
   strict allowlist (`/^session_[A-Za-z0-9]+$/`), validated at **both** the resolver output and the
   schema, returning no link + telemetry on mismatch — the server never hands arbitrary internal-file
   material to the web as a trusted deep-link token. The **WebSPA** composes the
   `https://claude.ai/code/<id>` URL (URL shape is a presentation concern — keeps the server agnostic
   to claude.ai's web/mobile URL forms).

9. **Resolver is a dedicated component** (`sessionLinkResolver`), not folded into `sessionService` —
   mirrors `sessionProbe`'s single-responsibility precedent and isolates the fragile file read.

10. **Launch argv is a testable invariant, not a coordination note.** *(Codex Architecture review,
    medium #5.)* Introduce a **composable launch-argv builder** now, with a test asserting
    `--session-id`, `--remote-control` (and the `name-sessions` `-n/--name` flag) compose and that
    `--session-id <uuid>` is always present — because `--session-id` is the resolver's only exact
    join key, a rebase that silently drops it would kill every link. `name-sessions` is not an active
    OpenSpec change in this repo (⇒ no `dependencies.md` edge), so the invariant lives in this
    change's tests/specs; whichever branch merges first, the other rebases against the builder.

11. **UI affordance prototyped first (switch-feature-ui).** The "open in Claude web" link/icon
    placement (beside the per-session Plug), its absent/disabled state when no bridge id is known yet,
    and its hover/label are sketched as a quarantined Storybook prototype before design records the
    pattern.

**Documentation destinations (seed for `docs-migration.md`):**

- Author / update the sessions-slice dev doc to record the dependency on the undocumented
  `~/.claude/sessions/<pid>.json` format and the bridge-id resolution + degradation contract
  (`author →` / `merge →` a `docs/dev/...` page — exact page confirmed at design).
- `retire —` no plans page exists.

## Open questions

1. **Timing of `bridgeSessionId`.** How long after launch does the bridge id appear in the state
   file? Confirms the "link shows up on a later poll" UX. Verify during TDD with a live launch.

2. **Flag composition.** Confirm `--session-id` and `--remote-control` compose and that the assigned
   UUID lands in the state file's `sessionId`. Verify during TDD.

3. **State-file lifecycle.** Are `<pid>.json` files cleaned up on exit, and can a live session ever
   lack a fresh record (server restart; a session launched outside Switchboard)? *Direction already
   set by Decisions 5 & 7 — no ledger record / no match ⇒ no link (never a `cwd` guess), and stale
   files are tolerated by the bounded per-poll scan.* The remaining work is empirical: confirm the
   lifecycle during design/TDD and size the scan guards accordingly.

4. **Exact dev-doc destination** for the internal-file dependency — open until design / docs-migration.
