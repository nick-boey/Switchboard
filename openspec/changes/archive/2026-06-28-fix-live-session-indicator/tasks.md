## 1. Regression test

- [x] 1.1 Write a failing unit test for a session-count aggregation helper (in
  `apps/web/src/sessions/`): given the cloned-repos list and each repo's set of live `<wt-id>`s,
  it returns the summed total — covering zero sessions, a single repo, and aggregation across
  multiple repos (red).
- [x] 1.2 Extend `apps/web/src/components/AppShell.test.tsx` with a failing test that the header
  (`data-testid="live-session-count"`) renders the **derived** aggregate count — non-zero when
  liveness data reports live sessions — rather than the hardcoded `0` default (red).
- [x] 1.3 Add a failing test for self-correction: when the per-repo liveness data changes from
  live to not-live on a refetch, the header count **decreases** to the new aggregate (red). Drive
  it through the same query path the worktrees hub uses (`sessionLivenessQueryKey`), not a one-shot
  fetch, so a happy-path-only implementation cannot pass it.

## 2. Fix

- [x] 2.1 Add the aggregation helper over `fetchLiveSessions` + the `['cloned-repos']` list
  (co-located with the existing session queries, exported via `apps/web/src/sessions/index.ts`),
  using TanStack Query + the typed client — make task 1.1 pass (green).
- [x] 2.2 Wire `AppShell` to compute the header count from the aggregated per-repo liveness and
  pass it to the existing header indicator instead of relying on the `liveSessions = 0` default
  (keep the prop as the Storybook/test injection seam) — make task 1.2 pass (green).
- [x] 2.3 Define the re-read mechanism so the header self-corrects: run one liveness query per
  cloned repo under the shared `sessionLivenessQueryKey(repoId)` key with the hub's
  `refetchInterval` (4000ms), so the header shares the worktrees hub's cache, picks up the
  invalidations the hub already fires after launch/stop, and re-aggregates on each poll — make
  task 1.3 pass (green).
- [x] 2.4 Run `just typecheck`, `just lint`, and `just test`; refactor while keeping tests green.

## 3. Implementation-review follow-ups (Codex Implementation checkpoint)

- [x] 3.1 Keep the `liveSessions` override genuinely display-only: when it is provided, start no
  liveness queries — `useLiveSessionCount(client, liveSessions === undefined ? repos : [])` — so an
  injected count never triggers per-repo session polling (Codex low finding).
- [x] 3.2 Add DOM test infra to `@switchboard/web` (`@testing-library/react` + `jsdom`) for
  component tests that must observe post-mount updates, scoped via a per-file
  `@vitest-environment jsdom` docblock so the existing node-env tests are unaffected.
- [x] 3.3 Replace the weak two-snapshot self-correction test with a **mounted** regression test
  (red→green): render `AppShell` once under a single `QueryClient` with seeded liveness, then update
  the shared `sessionLivenessQueryKey` data and assert the already-mounted header count **decreases**
  and the indicator flips from on to off — proving self-correction on the next liveness read, not two
  independent snapshots (Codex medium finding).
- [x] 3.4 Re-run `just typecheck`, `just lint`, and `just test` (all green).
