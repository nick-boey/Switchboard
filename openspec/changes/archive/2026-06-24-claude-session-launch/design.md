## Context

`claude-session-launch` is the **third and final feature change** in the MVP chain
(`repo-clone-browse → worktree-management → claude-session-launch`). A cloned repo is a bare
repository; a worktree is a real checkout on a branch; a **session** is `claude --remote-control`
running **inside** that checkout so the official Claude mobile app can drive the conversation. This
change starts, tracks, and stops those sessions — the job the mobile app cannot do.

Current state going in (the implemented slices this builds on):

- **`worktree-management`** (implemented) shipped:
  - the **canonical path-safe ID scheme** — `idForBranch(branch) → <wt-id> = <slug>--<12hex>` in
    `packages/shared/src/worktrees.ts`, a pure, deterministic, **browser-safe** function (vendored
    sync `sha256Hex`, no `node:*`) exposed from the `@switchboard/shared` barrel **expressly so this
    change reuses it** for tmux naming, plus `slugForBranch` / `isValidWorktreeId`;
  - the on-disk worktree layout `~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>` and the Git
    service that creates/lists/removes them (`apps/server/src/worktrees/git-worktree.ts`, exposing
    `worktreePath(target, wtId)` and `listWorktrees(target)`);
  - the **session-liveness seam this change must fill**: `SessionProbe.hasActiveSession(repoId,
    wtId)` in `apps/server/src/worktrees/seams.ts`, consumed by the safe-to-delete predicate in
    `apps/server/src/worktrees/orchestrator.ts`. It defaults to `noSessionProbe` (always `false` —
    "no active session"), and `app.ts` currently builds the worktree orchestrator with **no**
    `sessionProbe`, so every worktree reads as idle. `worktree-management`'s design Decision 6
    states plainly: "`claude-session-launch` wires the real probe into the seam." That wiring is
    this change's responsibility.
- **`repo-clone-browse`** (implemented) shipped the reusable **operation ledger + per-key lock**
  (`apps/server/src/operations/`): one durable JSON record per `key`, idempotency, per-key
  serialization, abort/cancellation as a single terminal transition, and restart recovery. Its
  `OperationType` is additive (`'clone'` → `'clone' | 'worktree'`); a handler is registered per
  type and the shared store is left untouched for types a ledger does not own. It also shipped the
  **subprocess-runner seam** pattern (`git-runner.ts`: an injectable runner with a controllable
  fake) and the typed Hono RPC **contract + client** with a build-breaking contract test.
- **`ui-prototypes-mvp`** (implemented, archive deferred) shipped the production **per-worktree
  plug** (`apps/web/src/ui/plug/Plug.tsx`) and the worktrees hub. Two **locked confirmation-gate**
  decisions (2026-06-22) bind this change directly:
  - **Gate #1 — Sessions = the per-worktree plug.** The plug (Claude Code on/off per worktree)
    **fully replaces** the proposal's standalone session-list / launch screen for the MVP. The
    standalone `sessions.stories.tsx` was **retired**; its job is the plug on the worktrees hub.
    This change wires the plug's on/off behaviour — it does **not** build a session screen.
  - **Gate #2 — No launch handoff.** The proposal's "toast instructing the user to open the Claude
    mobile app" after launching is **dropped** (no longer a user story). It is not specified here.

Constraints owned by the programme page (`docs/plans/switchboard/mvp.md`, not re-litigated here):
**filesystem + tmux are the source of truth** — "repos and worktrees _are_ the disk; sessions _are_
tmux"; **track session existence + worktree mapping only** (no conversation metadata, no DB —
model/context/last-message are the mobile app's domain); launch `claude --remote-control`
**detached in tmux**; tmux session names **reuse the path-safe scheme** (no raw `sb-<repo>-<branch>`);
the **operation ledger + lock** governs launch; `claude` rides the **host's existing login** (the
remote-control auth spike is intentionally skipped — no per-session pairing UI); branch names and
worktree paths are **sensitive** in telemetry. The prototype quarantine holds — production code
**ports** the plug behaviour, it does not import `src/prototypes/**`.

## Goals / Non-Goals

**Goals:**

- **Launch a session** — start `claude --remote-control` **detached in a `tmux` session** rooted at
  the worktree (`repos/<repo-id>/worktrees/<wt-id>`), through the **operation ledger + lock** so the
  launch is idempotent, serialized per worktree, and exposes a transient `starting` state.
- **Name tmux sessions by reusing the canonical scheme** — a deterministic, tmux-safe session name
  derived from `(repo-id, wt-id)` by **composing the same `slugForBranch` + `sha256Hex` primitives**
  `idForBranch` already uses (single source of truth — no new hashing, no raw `sb-<repo>-<branch>`),
  with an `sb-` prefix so Switchboard sessions are identifiable in `tmux ls` and never collide with
  the user's own.
- **List / track sessions from tmux truth** — existence + `(repo-id, wt-id)` mapping only. Liveness
  is **always re-derived from tmux** (`tmux has-session` / `list-sessions`), never from the ledger
  record alone.
- **Provide the session-liveness source** consumed by `worktree-management`'s safe-to-delete seam —
  wire a real tmux-backed `SessionProbe` into `createWorktreeOrchestrator`, so a worktree with a
  live session is correctly **not idle** and `noActiveSession` becomes real.
- **Stop a session** (teardown) — `tmux kill-session`, the plug's stop action on a live plug.
- **Wire the plug's on/off behaviour** into the existing worktrees hub: the display-only plug
  becomes actionable, driven by per-worktree session status (`off` / `starting` / `on` / `error`).
- **Session API** (launch / stop / list / status) wired into the Hono app, typed client, and
  contract test; **Zod schemas** in `packages/shared`.
- Author the planned-architecture overlay `docs/dev/Architecture/Planned/claude-session-launch.c4`
  (deferred from `plan.md`; the Architecture review checkpoint fires when it lands).

**Non-Goals:**

- **A standalone session-list / launch screen** — superseded by the per-worktree plug (Gate #1).
  Re-introducing a session screen is out of scope.
- **A launch handoff / mobile-app toast** — dropped (Gate #2).
- **Conversation metadata** — model, context usage, last message, message history. The mobile app
  owns these; Switchboard tracks existence + mapping only. No DB.
- **Per-session pairing / remote-control auth UI** — `claude` rides the host's existing login; the
  remote-control auth spike is skipped (programme decision).
- **Streaming tmux output to a browser terminal** — Future feature (programme Non-Goals).
- **Automatic session teardown when a worktree is force-deleted** — `worktree-management` owns delete
  and must not import session teardown (it would invert the slice dependency). Teardown is the user's
  explicit plug action; an orphaned session is **not** auto-killed here and is **not** surfaced by
  `session-list` (which lists existing worktrees only) — it requires manual cleanup, a known
  limitation (Open Questions).
- **Branch / worktree lifecycle** — owned by `worktree-management`.

## Decisions

### Decision 1 — tmux session name: reuse the `slug--hash` scheme over `(repo-id, wt-id)`

The tmux session name is derived by a new pure function in `packages/shared/src/sessions.ts` that
**reuses the existing path-safe primitives** rather than inventing a scheme:

```
tmuxSessionName(repoId, wtId) = `sb-${slugForBranch(`${repoId} ${wtId}`)}--${sha256Hex(`${repoId}/${wtId}`).slice(0, 12)}`
                                  then fold any '.' → '-'  (tmux reserves '.' and ':')
```

- **Why `(repo-id, wt-id)`, not just `<wt-id>`:** `<wt-id>` is derived from the **branch only**
  (`idForBranch`), so the same branch name in two different repos yields the **same** `<wt-id>`.
  tmux is a single flat namespace, so the session name must also encode the repo. The
  `worktree-management` seam already keys liveness by `(repoId, wtId)` — this name uses the same
  pair, keeping the probe and the name consistent.
- **Why reuse `slugForBranch` + `sha256Hex`:** the programme mandates "tmux names use the same
  path-safe scheme." Composing the very functions `idForBranch` is built from (not a parallel
  implementation) is the literal single-source-of-truth reuse. The 12-hex SHA-256 over the **exact**
  `repoId/wtId` carries collision resistance (same backstop philosophy as `<wt-id>`); the slug is
  recognisable-only.
- **tmux-safety pass:** the shared charset `[a-z0-9._-]` permits `.`, which tmux treats as a
  `window.pane` separator; the builder folds `.` → `-` so the result is a legal tmux session name
  (also free of `:`, `/`, and whitespace). A `SESSION_NAME` regex + `isValidTmuxSessionName` guard
  re-checks the shape (defence in depth, mirroring `isValidWorktreeId`).
- **Forward derivation only — never decode.** Like `<wt-id>` (whose exact branch is recovered from
  git, never decoded), the tmux name is lossy. Liveness and listing **derive the name forward** from
  a known `(repoId, wtId)` and test membership (`has-session`); they never parse a tmux name back
  into a branch.

_Alternative considered:_ name sessions by `<wt-id>` alone — rejected (cross-repo collisions in the
flat tmux namespace). _Alternative:_ a raw `sb-<repo>-<branch>` name — rejected by the programme
(unsafe branch chars, no collision resistance).

### Decision 2 — Launch detached in tmux; the launch is a tracked `session` operation

A launch starts the session **detached** so it survives the HTTP request:

```
tmux new-session -d -s <tmuxSessionName> -c <worktreePath> -- claude --remote-control
```

`-d` detaches; `-c <worktreePath>` roots it in the worktree; `--` then the command **as argv** (no
shell, so an adversarial branch-derived path or name is never interpolated into a shell line).

Launch runs through the **operation ledger** (programme mandate) as a new additive
`OperationType` **`'session'`** (the third type, exactly as `'worktree'` was added to `'clone'`):

- **Key:** a **distinct namespace** `session/<repo-id>/<wt-id>`. The ledger keys by `key` string
  (record file = `encodeURIComponent(key).json`), and the worktree-create op already owns
  `<repo-id>/<wt-id>` — a session op must not collide with it, so it is prefixed.
- **Handler:** `isComplete(record)` = "the tmux session exists" (`tmuxRunner.hasSession(name)`) —
  **the live tmux session is the operation's durable success marker**, mirroring how the worktree
  directory is the worktree op's marker. `cleanup(record)` = kill the session if a half-launch
  created one. This is a faithful reuse of the ledger's handler contract.
- **What the ledger buys:** idempotency (double-tapping the plug launches once), per-key
  serialization, and the transient `starting` state the plug renders — plus abort.

_Deliberate divergence from clone/worktree ops (flag for Artifacts review):_ for clone/worktree the
ledger's worker **is** the long-running pid that restart-recovery probes. A detached tmux session
has **no pid the ledger can track** (the `tmux` client exits immediately; the server daemon
persists). So the launch op is **short-lived** — it settles to `succeeded` as soon as the detached
session is created — and **liveness is authoritative from tmux, never from the ledger record**. The
op record drives only the transient `starting` UI + idempotency; the moment it settles, the
plug's state comes from the tmux-backed liveness query (Decision 4). On a restart mid-launch, the
ledger reconciles the `running` record conservatively (no pid → leave/mark failed), and the next
liveness query corrects the displayed state from tmux truth. This keeps "sessions _are_ tmux" intact.

**Stale `succeeded` records never block relaunch.** Because the tmux session is the op's success
marker and can vanish _outside_ Switchboard, idempotent reuse is gated on the **live** marker, not on
the settled state alone. The implemented ledger reuses any record in `{pending, running, succeeded}`
without consulting the handler — so before reusing a `succeeded` record the ledger MUST re-check the
handler's `isComplete` (for `session`, `tmuxRunner.hasSession`), exactly as its abort and reconcile
paths already do. A `succeeded` record whose tmux session is gone is **stale**: it is superseded by a
fresh launch op that creates a NEW detached session. So after an external kill (the plug reads `off`
from tmux truth), activating the plug **relaunches** rather than no-opping on the stale record. This
is the one terminal-decision path in `start()` that today trusts state alone; closing it for the
marker-backed `session` op is the consistent fix. (Durable-marker ops — clone/worktree — normally
still have their on-disk marker, so their reuse is unchanged in practice.) Launch, this stale-record
reconcile, and stop's tmux **kill** all run under the **same per-session key lock**; stop first drains
any in-flight launch with that lock **released** (the worker settles only by reacquiring the lock — so
awaiting settlement while holding it would deadlock), then takes the lock to kill (Decision 6).

### Decision 3 — TmuxRunner subprocess seam (mirrors GitRunner)

tmux access goes through an injectable **`TmuxRunner`** seam (`apps/server/src/sessions/tmux-runner.ts`),
mirroring `git-runner.ts`: production spawns `tmux` via `child_process`; tests inject a controllable
fake. Methods (the minimal surface): `newSession(name, cwd, command)`, `hasSession(name)`,
`listSessions()` (returns the live `sb-`-prefixed names), `killSession(name)`. This makes launch,
liveness, listing, and teardown all deterministically testable without a real tmux, and keeps the
"talk to the host through a seam" pattern consistent across slices.

### Decision 4 — Session liveness + listing are tmux-derived; the `SessionProbe` provider

**Liveness** = does a live tmux session named `tmuxSessionName(repoId, wtId)` exist. The
`SessionProbe` this change provides (`apps/server/src/sessions/session-probe.ts`,
`createSessionProbe(tmuxRunner): SessionProbe`) implements exactly the seam interface
`worktree-management` defined:

```
hasActiveSession(repoId, wtId) = tmuxRunner.hasSession(tmuxSessionName(repoId, wtId))
```

This is the **cross-change seam fulfilment**: `app.ts` builds this probe and passes it to
`createWorktreeOrchestrator(ctx, { sessionProbe })`, replacing the `noSessionProbe` default. A
worktree with a live session now reports `hasActiveSession = true`, so the safe-to-delete predicate
treats it as **not idle** — `noActiveSession` becomes real.

**No dependency cycle.** The probe depends **only** on `TmuxRunner` + the shared `tmuxSessionName` —
it never touches worktree internals. So even though session *launch* depends on the worktree service
(for `worktreePath`), the thing the worktree orchestrator consumes (the probe) has **no back-edge**.
Construction order in `app.ts`: build `tmuxRunner` → build the tmux-only `sessionProbe` → pass it to
**both** the worktree orchestrator and the session orchestrator. No orchestrator-to-orchestrator
import.

**Listing** (`session-list`) = for the `(repoId, wtId)` set of a repo's **existing** worktrees, return
those whose derived name is live in tmux — existence + mapping only (`{ repoId, wtId, status: 'on' }`).
Forward derivation, never decode (Decision 1). `session-list` serves exactly two consumers — (a) the
per-worktree **plug** liveness on the hub and (b) the `SessionProbe` seam below — and **nothing more**.
Because the candidate set is the current worktrees, a session whose worktree has been deleted (an
orphan) cannot be derived and is **out of scope** (Decision 6). This is the data the hub uses to set
each plug's status — **there is no standalone session screen** (Gate #1).

### Decision 5 — Plug session states (off / starting / on / error), wired into the existing hub

The plug already exists (`Plug.tsx`, states `running | working | error | idle | off`, start/stop
actions) and is **display-only** in `WorktreesView.tsx` today. This change makes it actionable by
wiring `onActivate` and feeding a derived status. The session model → plug visual mapping:

| Session model | Plug visual | Action on activate    | Source                                  |
| ------------- | ----------- | --------------------- | --------------------------------------- |
| `off`         | `off`       | start (launch)        | no live tmux session                    |
| `starting`    | `working`   | guarded (disabled)    | launch op in-flight (`pending`/`running`)|
| `on`          | `running`   | stop (kill-session)   | live tmux session (liveness query)      |
| `error`       | `error`     | stop / retry          | launch op `failed`, or stop failed      |

The plug's `idle` visual is **reserved/unused in the MVP**: the change tracks session *existence*
only (programme), so any live session reads as `on`/`running` — there is no "connected but inactive"
signal to distinguish. The wiring lives with the worktrees-hub slice (`apps/web`): the container
runs a per-repo session-liveness query (TanStack Query against the typed client) + launch/stop
mutations, derives each worktree's plug status, and passes `plugStatus` + `onToggleSession` down to
the worktree rows. Optimistic `starting`/`working` during an in-flight mutation, then re-derived
from tmux truth on the next query.

### Decision 6 — Teardown (stop) serializes with launch via a drain-then-lock loop; orphans need manual cleanup

Stopping a session = `tmuxRunner.killSession(tmuxSessionName(repoId, wtId))`. Stop is **not** ledgered
(there is nothing long-running, and tmux truth is authoritative for the resulting state — the plug
re-derives `off` from the next liveness query), **but it serializes with launch on the same
per-session boundary** (the launch op's key `session/<repo-id>/<wt-id>`). The orchestrator injects one
shared `KeyedLock` into the session ledger (`OperationLedgerConfig.lock`) so the launch op locks that
key; stop uses the same `KeyedLock` and key.

**Why the naive "drain while holding the lock" deadlocks (the bug this closes).** The ledger worker
writes its terminal state (`succeeded`/`failed`) only after it **reacquires the same per-key lock**
(see `ledger.ts`: the worker's success/failure transition runs inside `lock.run(record.key, …)`), and
`ledger.whenSettled(key)` resolves only once that terminal write lands. So if stop held the key lock
and awaited `whenSettled(key)` _inside_ it, the launch worker could never reacquire the lock to
settle, `whenSettled` would never resolve, and stop would hang — leaving the session live and the plug
stuck (the very race this was meant to close). The drain and the lock must therefore be **ordered, not
nested**.

**The non-deadlocking ordering — drain _outside_ the lock, then kill _inside_ it, in a short loop:**

```
stopSession(repoId, wtId):
  key  = `session/<repo-id>/<wt-id>`
  name = tmuxSessionName(repoId, wtId)
  loop:
    await ledger.whenSettled(key)                 # DRAIN — never under the key lock, so the
                                                  # in-flight launch worker can reacquire it to settle
    const done = await lock.run(key, async () => { # KILL — serialized against launch's ledger writes
      const rec = await ledger.get(key)
      if (rec is pending|running) return false      # a launch registered after our drain; re-drain
      await tmuxRunner.killSession(name)            # idempotent: no-op if already absent
      return true
    })
    if (done) break
```

- **No deadlock:** `whenSettled(key)` is awaited with the lock **released**, so the in-flight launch
  worker can reacquire the key lock and write its terminal state; the drain then resolves. The kill is
  the only thing that holds the lock, and it never awaits settlement.
- **Kill still serialized against launch:** the actual `killSession` runs inside `lock.run(key, …)`,
  the same key the ledger's `start` and the worker's terminal write take, so a kill never interleaves
  with a launch's ledger bookkeeping.
- **Why a loop (and the in-flight re-check):** the ledger's launch _worker_ spawns the tmux session in
  its async task, which runs **outside** the key lock (the lock guards only `start`'s record write and
  the terminal transition). So a launch that registers _between_ stop's drain and stop's lock
  acquisition could still spawn its session after a single drain — the classic strand. The loop closes
  this: under the lock stop re-reads the op; if a launch is **in-flight** (`pending`/`running`) it
  releases the lock and re-drains (letting that worker spawn-then-settle), then kills on the next pass.
  The loop terminates because each pass either kills (the op is terminal or absent) or drains exactly
  one launch that had already registered before that pass took the lock, and while stop holds the lock
  no new `start` can register.

**Final-state rule (stop wins → `off`):** for a launch racing a stop, stop drains every launch it can
observe (one already registered, or one that registers between drain and lock — the loop catches it)
and kills under the lock, so the session ends `off` (the conservative outcome — the user can relaunch)
and liveness is re-derived from tmux afterward. The only way a launch ends `on` is if its `start`
acquires the key lock **strictly after** stop's kill completes — i.e. it is sequenced entirely after
the stop, a fresh relaunch rather than a member of the race. The plug shows an optimistic transient
state during the in-flight stop. _(Why not the per-repo lock?_ launch already locks only the
per-session key via the ledger; serializing stop's kill on that **same** key — not a coarser per-repo
lock — is what actually makes the two mutually exclusive.)

A worktree force-deleted while its session is live (the MVP delete path is always confirmation-gated)
leaves an **orphaned** tmux session whose cwd is gone. This change does **not** auto-kill on delete —
`worktree-management` owns delete and must not import session teardown (that would invert the slice
dependency; it stays one-directional). The orphan is **not** surfaced by `session-list` either:
listing forward-derives names from the repo's **existing** worktrees (Decision 4), and a deleted
worktree has left that set, so its session name can no longer be derived (names are never decoded —
Decision 1) and there is no standalone session screen to surface it on (Gate #1). The orphan
therefore requires **manual cleanup** (e.g. `tmux kill-session`) — a known limitation; richer orphan
reconciliation is an Open Question.

### Decision 7 — Telemetry: session names, worktree paths, and the launch command are sensitive

The tmux session name is derived from the branch (the same slug-leak vector that makes `<wt-id>`
sensitive — `worktree-management` Decision 7), the worktree path is an absolute path, and the launch
command carries both. So session spans put the session name, `(repoId, wtId)`, the worktree path,
and the launch argv under **blocklisted attribute keys** (the existing `RedactingSpanProcessor`
masks them) — never as plain attributes. New sensitive keys are added to the blocklist in
`telemetry.ts`. tmux subprocess stderr is discarded without logging (as the git-runner does).

### Decision 8 — Vertical slice

The slice spans:

- `packages/shared/src/sessions.ts` — `tmuxSessionName` (reusing `slugForBranch`/`sha256Hex`),
  `isValidTmuxSessionName`, the session launch/stop request schemas (`<repo-id>` + `<wt-id>`), the
  session summary + list response schemas, and the plug-status type; reusing `operationStatusSchema`
  for the launch op status. Exported from the `@switchboard/shared` barrel. Co-located test.
- `apps/server/src/sessions/` — `tmux-runner.ts` (seam + system impl + fake), `session-probe.ts`
  (the `SessionProbe` provider), `orchestrator.ts` (launch via ledger + the `'session'` handler,
  stop under the lock, list/liveness), the session routes wired into `app.ts`, and the typed
  client/contract entries. A `no-leak.test.ts` mirrors the worktree one. The `'session'`
  `OperationType` is added additively in `operations/ledger.ts`.
- `apps/server/src/app.ts` — build the session orchestrator + the tmux-backed `sessionProbe`, wire
  the probe into `createWorktreeOrchestrator` (the seam fulfilment), and register the session routes.
- `apps/web/src/sessions/` — the session client logic (liveness query + launch/stop mutations +
  session→plug-status mapping); `apps/web/src/worktrees/` consumes it to make the plug actionable
  (ports the prototype's plug behaviour — no `src/prototypes/**` import).

No new config slot is needed (`claude` rides the host login; no PAT/credential added).

## Testing strategy

Unit tests run against TS source via the `switchboard-source` condition (no pre-build); E2E needs
`just build` first. The reusable harness from prior slices is largely sufficient — this change
**reuses** it and adds one focused seam fake.

**Test-harness gap assessment.** A `TmuxRunner` fake does not yet exist (the GitRunner fake is the
precedent). It is the one piece of test infrastructure to build first and becomes the **leading "Test
infrastructure" task group**: a controllable in-memory fake tmux (a `Map` of live session names) that
records `newSession` calls (name, cwd, command — so launch wiring + redaction can be asserted) and
answers `hasSession` / `listSessions` / `killSession`, plus a default "no sessions" instance. The
operation-ledger scaffolding, the typed-client/contract test harness, the `RedactingSpanProcessor`
no-leak harness, and the TanStack-Query/Mantine render harness all already exist and are reused.

**Unit / integration surface:**

- `packages/shared` — `tmuxSessionName` is deterministic, tmux-safe (no `.`/`:`/`/`/whitespace),
  distinct for the same branch across different repos, and stable for the same `(repoId, wtId)`;
  `isValidTmuxSessionName` accepts derived names and rejects malformed ones; the request/response
  schemas parse valid and reject malformed `<repo-id>`/`<wt-id>` (→ `422`).
- `apps/server` — launch spawns the detached tmux command rooted at `worktreePath` with
  `claude --remote-control` (asserted via the fake) and runs through the ledger (idempotent
  double-launch → one session; transient `starting`; `failed` → plug `error`); the `'session'`
  handler's `isComplete`/`cleanup` use tmux truth; `hasActiveSession` reflects the fake's live set;
  **the wired `SessionProbe` makes the worktree safe-to-delete predicate report a live-session
  worktree as not idle** (the seam fulfilment, asserted against the worktree orchestrator); stop
  kills the session and liveness flips to `off`; list returns existence + mapping only; routes
  validate input (`422`) and the typed client mirrors every route (contract test); the no-leak test
  proves session name / path / launch argv never reach unredacted span attributes.
- `apps/web` — the plug renders `off`/`starting`/`on`/`error` from session status; activating an
  `off` plug fires launch and a live plug fires stop; a `working` plug is guarded; the hub query
  drives per-worktree plug status. (No standalone session screen is built — Gate #1.)

**E2E:** extend the worktree E2E path so a worktree's plug can launch and stop a session against the
throwaway temp-git fixture with a **faked tmux** boundary (a real `claude` login is not available in
CI). The E2E asserts the plug on/off round-trip and that a live session blocks a non-force delete —
proving the seam end-to-end.

## Risks / Trade-offs

- **[Risk] Ledger record vs tmux truth can diverge** (a session killed outside Switchboard; a
  restart mid-launch). → **Mitigation:** liveness is **always** re-derived from tmux (Decision 2/4);
  the ledger record only drives the transient `starting` state + idempotency. The displayed plug
  state self-corrects on the next liveness query.
- **[Risk] Orphaned sessions** after a force-delete of a worktree with a live session. →
  **Mitigation:** no auto-kill on delete (keeps the slice dependency one-directional); the orphan is
  not surfaced by `session-list` (it lists existing worktrees only) and requires manual cleanup (e.g.
  `tmux kill-session`) — a known limitation tracked as an Open Question.
- **[Risk] Launch/stop race + serialization deadlock** — a stop and an in-flight launch interleaving
  (stop kills nothing while a launch later strands a session, or stop kills a session a launch is about
  to settle `succeeded`); and the deadlock if stop awaited the launch's settlement _while holding_ the
  per-session lock — the ledger worker settles only by reacquiring that same lock, so `whenSettled`
  would never resolve and stop would hang. → **Mitigation:** stop **drains** the in-flight launch with
  the lock **released** (`ledger.whenSettled(key)`), **then** kills **under** the per-session key lock,
  in a short drain-then-lock loop whose in-flight re-check re-drains any launch that registers between
  drain and lock (Decision 6). So launch and stop never interleave, stop never hangs, and the final
  state is deterministic (stop wins → `off`), re-derived from tmux.
- **[Risk] tmux not installed / `claude` not logged in on the host.** → **Mitigation:** the launch op
  surfaces a typed `failed` outcome (plug `error`) rather than a 500; the runner discards stderr (no
  leak). Provisioning tmux + the `claude` login is the host/runtime concern (`runtime-cli-docker` /
  programme spike), not this slice.
- **[Trade-off] The launch op is short-lived and pid-less**, unlike clone/worktree ops. → Accepted
  and documented (Decision 2): the tmux session is the durable marker; the op exists for idempotency
  + the `starting` state, not for long-running pid tracking. This is the one place the ledger reuse
  bends, and the Artifacts review should confirm the divergence is sound.
- **[Trade-off] The plug's `idle` visual is unused** in the MVP. → Accepted: existence-only tracking
  (programme) has no "connected but inactive" signal; reserving `idle` avoids inventing conversation
  metadata that is the mobile app's domain.

## Open Questions

- **Orphan reconciliation:** should a background reconcile (or the worktree-delete path, via a
  published seam in the *other* direction) eventually kill sessions whose worktree no longer exists?
  Deferred — the MVP answer is **manual cleanup** of the orphan; a future change can add
  reconciliation without changing this slice's contracts.
- **Relaunch / dead-session semantics:** if `claude` exits inside a still-live tmux session, the
  session reads `on` (tmux truth) though Claude is gone. The MVP accepts tmux-existence as the
  liveness definition (programme: "sessions _are_ tmux"); a richer "is `claude` actually running"
  probe is a future refinement.
