## 1. Test infrastructure

- [x] 1.1 Build the controllable in-memory **fake `TmuxRunner`** in
      `apps/server/src/testing/tmux-runner.ts` (the GitRunner fake is the precedent): a `Map` of live
      session names that records `newSession` calls (name, cwd, command — so launch wiring and
      redaction can be asserted) and answers `hasSession` / `listSessions` / `killSession`, plus a
      default "no sessions" instance and a `setSession`-style control. Add its own
      `tmux-runner.test.ts` proving the fake degrades to "no sessions" and is independently
      controllable per session name.

## 2. Shared: tmux session naming + session schemas (packages/shared)

- [x] 2.1 (red) Write `packages/shared/src/sessions.test.ts`: `tmuxSessionName(repoId, wtId)` is
      deterministic, tmux-safe (no `.`/`:`/`/`/whitespace), carries the `sb-` prefix, is **distinct
      for the same branch across different repos** and **stable for the same `(repoId, wtId)`**, and
      reuses the canonical `slugForBranch`/`sha256Hex` primitives; `isValidTmuxSessionName` accepts
      derived names and rejects malformed ones; the launch/stop/list request schemas parse valid
      input and reject malformed `<repo-id>`/`<wt-id>`.
- [x] 2.2 (green) Implement `packages/shared/src/sessions.ts`: `tmuxSessionName` (composing
      `slugForBranch` + `sha256Hex`, folding `.`→`-`), `isValidTmuxSessionName`, the session
      launch/stop request schemas (`<repo-id>` + `<wt-id>`), the session summary + list-response
      schemas (existence + mapping only), and the plug-status type; reuse `operationStatusSchema` for
      launch status. Export all from the `@switchboard/shared` barrel (`index.ts`).

## 3. Server: TmuxRunner subprocess seam (apps/server)

- [x] 3.1 (red) Write `apps/server/src/sessions/tmux-runner.test.ts` against an injectable spawn:
      the system runner constructs `tmux new-session -d -s <name> -c <worktreePath> -- claude
      --remote-control` as **argv** (no shell), and `hasSession`/`listSessions`/`killSession` map to
      the right `tmux` invocations.
- [x] 3.2 (green) Implement `apps/server/src/sessions/tmux-runner.ts`: the `TmuxRunner` interface +
      system implementation (spawn `tmux` via `child_process`, discard stderr without logging),
      mirroring `repos/git-runner.ts`.

## 4. Server: session launch through the ledger (apps/server)

- [x] 4.1 (red) Write `apps/server/src/sessions/orchestrator.test.ts` (with the fake TmuxRunner +
      operation-ledger scaffolding): a launch spawns the detached session rooted at the worktree's
      `worktreePath` running `claude --remote-control`; a duplicate/concurrent launch resolves to a
      **single** session (idempotent); the launch op key is in a namespace **distinct** from the
      worktree-create key; a launch subprocess failure resolves to a **typed error** outcome leaving
      no live session; and **liveness is re-derived from tmux** (a settled op whose session was
      killed externally reports off).
- [x] 4.2 (green) Add the additive `'session'` `OperationType` (and leave other ledgers' records
      untouched) in `apps/server/src/operations/ledger.ts`; implement the session orchestrator
      (`apps/server/src/sessions/orchestrator.ts`) — launch as a `session`-typed op keyed
      `session/<repo-id>/<wt-id>`, with the handler's `isComplete` = "tmux session exists" and
      `cleanup` = kill a half-launched session; obtain the worktree path from the worktree service
      (`worktreePath`).
- [x] 4.3 (red) Extend `orchestrator.test.ts` with the **stale-record relaunch** case: after a launch
      settles `succeeded`, the tmux session is killed externally (fake), the worktree reports off, and
      a subsequent launch does **not** reuse the stale `succeeded` record — it re-checks the tmux
      marker (`isComplete`), finds it absent, and creates a **new** detached tmux session.
- [x] 4.4 (green) Gate idempotent reuse of a `succeeded` record on the live completion marker for the
      marker-backed `session` op: in `apps/server/src/operations/ledger.ts`, before reusing a
      `succeeded` record the ledger re-checks the handler's `isComplete` (for `session`, tmux
      liveness); when the marker no longer holds, the record is stale and a **fresh** launch op is
      started (creating a new tmux session). This mirrors the ledger's existing abort/reconcile
      `isComplete` re-checks; durable filesystem markers (clone/worktree) normally still hold, so their
      reuse is unchanged in practice. The reconcile runs under the per-session key lock.

## 5. Server: session liveness probe + listing (apps/server)

- [x] 5.1 (red) Write the failing tests for liveness + listing: `createSessionProbe(tmuxRunner)`
      implements `hasActiveSession(repoId, wtId)` by forward-deriving `tmuxSessionName` and testing
      `hasSession` (never decoding a name); listing a repo's sessions iterates the repo's **existing**
      worktrees and returns **existence + worktree mapping only** for live sessions (no conversation
      metadata; a deleted worktree's orphan session is out of scope — not listed).
- [x] 5.2 (green) Implement `apps/server/src/sessions/session-probe.ts` (the `SessionProbe` provider,
      depending only on `TmuxRunner` + `tmuxSessionName` — no worktree back-dependency) and the
      orchestrator's `listSessions(target)`.

## 6. Server: fulfil the worktree-management session-liveness seam (cross-change wiring)

- [x] 6.1 (red) Write the failing test proving the seam fulfilment against the **worktree**
      orchestrator: with the real tmux-backed `SessionProbe` injected
      (`createWorktreeOrchestrator(ctx, { sessionProbe })`), a worktree whose session is live reports
      `hasActiveSession = true`, so the safe-to-delete predicate treats it as **not idle** and a
      non-force delete is refused; a worktree with no session still reports no active session.
- [x] 6.2 (green) In `apps/server/src/app.ts`, build the `tmuxRunner` → the tmux-only `sessionProbe`
      → pass the probe to **both** the worktree orchestrator (replacing the `noSessionProbe` default)
      and the session orchestrator, with no orchestrator-to-orchestrator import (construction order
      avoids a cycle).

## 7. Server: stop / teardown (apps/server)

- [x] 7.1 (red) Write the failing tests: stopping a live session kills it and liveness flips to off;
      stopping an absent session is an **idempotent no-op success**; stop never touches the worktree
      or branch; a force-deleted worktree's live session is **not auto-killed** and the resulting tmux
      orphan is **not surfaced by the listing** (out of scope — needs manual cleanup).
- [x] 7.2 (green) Implement `stopSession` on the orchestrator (`tmuxRunner.killSession`), **not**
      ledgered — tmux truth is authoritative for the resulting state. Order it to serialize with launch
      **without deadlocking**: first **drain** any in-flight launch via `ledger.whenSettled(key)` with
      the per-session lock **released** (the launch worker settles only after it reacquires that same
      lock, so awaiting settlement while holding the lock would hang), **then** kill
      `tmuxRunner.killSession(name)` **under** `lock.run('session/<repo-id>/<wt-id>', …)` (the shared
      `KeyedLock` injected into the session ledger — the SAME key launch locks).
- [x] 7.3 (red) Write the failing **concurrency** tests (fake TmuxRunner + ledger scaffolding): a
      launch racing a stop, and a stop racing a duplicate launch, both serialize on the per-session
      boundary — assert the **final liveness** (off) and the **launch operation status** (settled
      `succeeded`, exactly one session created then killed), proving a stop never kills nothing while a
      launch later strands a session and a just-created session is never left orphaned. **Add the
      deadlock-regression case (required):** a stop begins after the launch has spawned the tmux session
      but **before** the launch worker reaches its terminal ledger write (drive the fake so the worker's
      terminal transition is still pending when the stop starts) — assert the stop **does not hang** (it
      drains with the per-session lock released, letting the worker reacquire the lock and settle), the
      launch op settles `succeeded`, and the final tmux-derived liveness is `off` (no live session).
      **Add the launch-between-drain-and-lock case:** a launch that registers after the stop's first
      drain is still drained-and-killed by the loop (final liveness `off`), proving the in-flight
      re-check prevents a strand.
- [x] 7.4 (green) Serialize all session lifecycle mutations on one per-session boundary **without
      deadlocking**: construct one shared `KeyedLock`, inject it into the session ledger
      (`OperationLedgerConfig.lock`) so launch and the stale-record reconcile (4.4) lock the per-session
      key. Implement `stopSession` as a **drain-then-lock loop**: (1) `await ledger.whenSettled(key)`
      with the lock **released**; (2) under `lock.run(key, …)` read the op — if a launch is still in
      flight (`pending`/`running`) release and re-drain, else `tmuxRunner.killSession(name)` and finish.
      This kills under the same key launch locks (mutual exclusion) while **never** awaiting settlement
      under the lock (no deadlock — the worker can reacquire the lock to settle), and the loop's
      in-flight re-check stops a launch that registers between drain and lock from stranding a session
      (its worker spawns the tmux session outside the lock).

## 8. Server: session API routes, contract, typed client, telemetry redaction (apps/server)

- [x] 8.1 (red) Write the route tests (`apps/server/src/sessions/routes.test.ts`): launch / stop /
      launch-status / session-list routes reject malformed `<repo-id>`/`<wt-id>` with `422` (handler
      not invoked) and report the shared shapes; the typed-client contract test fails on schema
      drift. Write `apps/server/src/sessions/no-leak.test.ts`: the session name, worktree path,
      `(repo-id, wt-id)`, and launch argv never reach unredacted span attributes; subprocess stderr
      is not logged.
- [x] 8.2 (green) Wire the session routes into `app.ts` (launch / stop / status / per-repo list),
      extend `contract.ts` + `client.ts` to mirror them, and add the new sensitive attribute keys
      (session name, worktree path, launch argv) to the blocklist in `telemetry.ts`.

## 9. Web: session client logic (apps/web/src/sessions)

- [x] 9.1 (red) Write the failing tests for the session slice's web logic: a per-repo
      session-liveness query (TanStack Query against the typed client) and launch/stop mutations, and
      a session→plug-status mapping yielding `off` / `starting` / `on` / `error` (off = no live
      session, starting = launch in flight, on = live, error = failed launch/stop), self-correcting
      from tmux truth on the next read.
- [x] 9.2 (green) Implement `apps/web/src/sessions/` (the query + mutations + the status mapping +
      barrel), consuming the typed client/contract — no import from `src/prototypes/**`.

## 10. Web: make the plug actionable on the worktrees hub (apps/web/src/worktrees)

- [x] 10.1 (red) Write the failing component/interaction tests: each worktree's plug renders its
      session status; activating an **off** plug fires a launch and a **live** plug fires a stop; a
      **transient** plug is guarded (no action); **no** standalone session screen and **no**
      post-launch mobile-app handoff toast appear.
- [x] 10.2 (green) Wire the plug in `WorktreesView`/`Worktrees` to consume the session slice: pass
      per-worktree `plugStatus` + `onToggleSession` (launch/stop) into the worktree rows, replacing
      the display-only `Plug status="idle"` with the live, actionable plug.

## 11. E2E (needs `just build` first)

- [ ] 11.1 Add an `e2e/*.spec.ts` covering the plug on/off round-trip against the throwaway temp-git
      fixture with a **faked tmux boundary** (no real `claude` login in CI), and asserting that a
      worktree with a live session **blocks a non-force delete** — proving the session-liveness seam
      end-to-end. Run `just build` then `just e2e`.

## 12. Planned-architecture overlay (docs-migration `author →` row)

- [ ] 12.1 Author `docs/dev/Architecture/Planned/claude-session-launch.c4`: `extend`
      `Switchboard.Api` with the **Session service** (session launch/stop/list, the `session`-typed
      operation-ledger usage, and the tmux-backed liveness probe wired into the worktree slice's
      safe-to-delete seam) and realize the `Switchboard.Api -> TmuxHost` relationship; tag every
      addition `#todo`; prefix view ids `claude-session-launch-*`; list the added element/view ids in
      `plan.md`; validate with `pnpm --dir site exec likec4 validate --no-layout
      ../docs/dev/Architecture`. (The Architecture review checkpoint fires when this lands.)

## 13. Verification gate

- [ ] 13.1 Run `just test`, `just lint`, `just typecheck`, then `just build` + `just e2e` — all green;
      confirm prettier-clean and that `openspec validate claude-session-launch --strict` passes.
