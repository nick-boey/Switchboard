# Tasks: link-claude-code-online

Red-green TDD throughout — the failing-test task precedes its implement-to-green task. Vertical-slice
order: shared contract → server launch/resolver → web affordance. See `design.md` for the harness gap.

## 1. Test infrastructure

- [x] 1.1 Add a per-session state-file **fixture set** under the server test tree: a valid+matching
      entry, two entries sharing one `cwd` (one stale), a malformed-JSON file, an oversized file, an
      **unknown-extra-field** entry (required fields valid), a **missing-required-field** entry, a
      bad-`bridgeSessionId`-token entry, and a **large overflow set** (more than N files spanning a
      range of mtimes).
- [x] 1.2 Give the resolver an **injectable sessions-dir + fs seam** (`readdir`/`readFile`/`stat`,
      default `join(homedir(),'.claude','sessions')`) so unit tests point it at the fixtures dir
      without touching the real home.

## 2. Shared contract — branded `bridgeSessionId`

- [x] 2.1 (red) Write a failing test for a branded `bridgeSessionId` schema (accepts `session_…`,
      rejects a UUID, empty, and wrong shape) and for its presence as an **optional** field on
      `sessionSummarySchema`.
- [x] 2.2 (green) Add the branded optional `bridgeSessionId`
      (`z.string().regex(/^session_[A-Za-z0-9]+$/).brand('BridgeSessionId').optional()`) to
      `sessionSummarySchema` in `packages/shared`.
- [x] 2.3 (red) Extend the server contract test so the session-list response type carries the optional
      `bridgeSessionId` and drift fails the build-time guard.
- [x] 2.4 (green) Thread the field through `apps/server/src/contract.ts` + `client.ts` so the contract
      test passes.

## 3. Launch — argv builder + recorded UUID join key

- [x] 3.1 (red) Write a failing test for `buildLaunchArgv({ sessionId })`: it composes both
      `--session-id <uuid>` and `--remote-control`, and a flag added/reordered around it still keeps
      `--session-id` present (the drop-guard invariant).
- [x] 3.2 (green) Implement `buildLaunchArgv`, replacing the `CLAUDE_LAUNCH_COMMAND` constant in
      `orchestrator.ts`.
- [x] 3.3 (red) Extend `orchestrator.test.ts` (real ledger + fake `TmuxRunner`): a launch records
      `metadata.sessionId`; a relaunch after stop records a **different** UUID; a relaunch after an
      **external tmux kill** (stale `succeeded` record) records a **different** UUID (not the dead
      session's).
- [x] 3.4 (green) In `launchSession`, generate `crypto.randomUUID()`, pass
      `metadata: { sessionId: uuid }` to `ledger.start`, and launch the built argv — keeping the argv
      under the blocklisted `session.argv` span key (redaction rule).

## 4. Bridge-id resolver + listing enrichment

- [x] 4.1 (red) Write `session-link-resolver.test.ts` against the fixtures: matching→resolved;
      non-matching UUID→none; stale-shared-`cwd`→the UUID-matched entry wins; bad-token→none;
      malformed/oversized→skipped (listing unaffected); **unknown extra field (required valid)→still
      resolves, no telemetry**; **missing/invalid required field→degrades + telemetry**; **overflow
      past newest-N / the deadline→only the newest-N inspected, overflow sessions get no link +
      `scan-bounded` telemetry, liveness unaffected**.
- [x] 4.2 (green) Implement `session-link-resolver.ts`: `readSessionStateIndex` (one bounded scan,
      per-file size guard, tolerant Zod validate, skip malformed, return `Map<sessionId,
      bridgeSessionId>` of brand-valid values) + the pure UUID→bridge lookup. Document the
      `~/.claude/sessions/<pid>.json` dependency + degradation contract in the module header.
- [x] 4.3 (red) Write a telemetry-redaction test: a degradation emits a **reason code + count only**,
      and never the bridge token or a file path in a plain span attribute.
- [x] 4.4 (green) Emit redaction-safe degradation telemetry; add any new sensitive key to the
      `telemetry.ts` blocklist.
- [x] 4.5 (red) Extend `orchestrator.test.ts`: `listSessions` attaches the resolved `bridgeSessionId`
      for a live session (resolver fixtured) and omits it when unresolved.
- [x] 4.6 (green) Wire `listSessions` to read each live session's recorded UUID from the ledger and
      enrich each `SessionSummary` via the resolver, building the index **once per call**.
- [x] 4.7 (Codex Implementation review, high) Bound the **stat phase** by the deadline too, not just
      the read loop: selecting newest-N requires a `stat` per entry, so the deadline clock now starts
      before the stat sweep and un-statted entries get no link + `scan-bounded` telemetry — a huge
      `~/.claude/sessions` can never delay tmux-derived liveness. Regression test: a 200-file dir with
      a fake clock + stat counter asserting the sweep stops well short of statting every entry.

## 5. Web affordance — "open in Claude web"

- [x] 5.1 (red) Extend `WorktreesView`/`session-plug` tests: the link renders for a live+resolved
      session (correct `href`, `target="_blank"`, `rel="noopener"`, accessible name) and is **absent**
      for `off`/`starting`/`error` and for live-but-unresolved.
- [x] 5.2 (green) Promote the prototype's `ClaudeWebLink` into the sessions slice and render it
      **immediately right of the `Plug`** in `WorktreeRow` (placement A); carry the optional
      `bridgeSessionId` through `session-model`/`session-queries` from the list response.
- [x] 5.3 Promote the prototype into a production story under `src/sessions/` asserting the rendered
      states (this is the prototype's promotion; resolve its `prototypes.md` row at archive).

## 6. Architecture model graduation (docs-migration `merge` row)

- [x] 6.1 Graduate `docs/dev/Architecture/Planned/link-claude-code-online.c4` into `model.c4` +
      `views.c4`: strip every `#todo`, fold the `sessionLinkResolver` component + its three edges into
      `model.c4` and the two `link-claude-code-online-*` views into `views.c4`, delete the overlay
      file, and validate with `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture`.
