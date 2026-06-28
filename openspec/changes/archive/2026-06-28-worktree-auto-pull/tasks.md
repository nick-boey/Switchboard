## 1. Regression test

- [x] 1.1 Add a failing test to `apps/server/src/worktrees/git-worktree.test.ts` reproducing the
  stale-base defect: after the fixture's bare clone, advance the remote (`fx.remote.git(...)`) with
  a new commit on the default base **and** on `fx.existingBranch`, then `createWorktree` for
  `mode: 'new'` (off the default base) and `mode: 'existing-remote'`; assert each worktree's `HEAD`
  contains the new remote commit and is not behind `origin/<branch>`. This fails today (red).

## 2. Fix

- [x] 2.1 Add a reusable branch-refresh operation in `apps/server/src/worktrees/git-worktree.ts`
  (alongside `fetchOrigin`/`refExists`/`defaultBranch`) and expose it on the `WorktreeService`
  interface so it is invocable independently of create (future manual trigger): fetch `origin`,
  then **fast-forward-only** update the local branch ref to its `origin/<branch>` tracking ref.
  Make it **best-effort** — swallow fetch/ff failure and leave the local tip. Keep sensitive values
  (branch name, worktree id/slug, path, git args) out of telemetry and logs per `telemetry.ts`, and
  keep the PAT in the credential helper — never in process args, the URL, or logs (reuse
  `fetchOrigin`'s credential-helper pattern).
- [x] 2.2 Wire the refresh into `createWorktree` so the regression test passes (green): in
  `mode: 'new'`, refresh the resolved base before `worktree add -b`; in `mode: 'existing-remote'`
  with a pre-existing local branch, refresh that branch before `worktree add`. Leave the
  fresh-from-`origin/<branch>` path (no local branch yet) unchanged — it is already up to date.
- [x] 2.3 Add tests for the refresh contract: a divergent **base** (new-branch mode) and a divergent
  **existing-remote** local branch are each left intact and the worktree is built from that local
  tip — never reset to the remote tip — while the create still succeeds (fast-forward-only); an
  unreachable remote / failed fetch still creates from the local tip (best-effort); the refresh
  emits no branch name, worktree id, or absolute path into telemetry/logs (PAT stays in the
  credential helper, never in process args); and the operation is callable directly via the service,
  independent of create.
- [x] 2.4 Run `just typecheck` and the worktree unit tests; refactor while keeping tests green.
- [x] 2.5 Implementation-review hardening (Codex): refresh the remote-tracking ref (`origin/<branch>`)
  as well as the local branch, fast-forward the local branch via a `merge-base --is-ancestor` check +
  `branch -f` (refuses a checked-out branch), and cut `mode: 'new'` from the freshest base ref so it
  picks up remote advances even when the base is checked out in another worktree. Add regression
  tests for the checked-out-base case and for `origin/<branch>` advancing on a direct refresh.
