## 1. Regression test

- [x] 1.1 In `packages/shared/src/sessions.test.ts`, add failing unit tests for a new
  `sessionDisplayName(repoId, wtId)` helper:
  - `('acme/widget-factory', 'name-sessions--7130389dc45a')` → `widget-factory/name-sessions`
    (repo name + the `<wt-id>` with only its trailing `--<12 hex>` stripped — never an interior `-`);
  - **cross-repo distinctness** (differently-named repos): the same branch/`<wt-id>` under two repos
    with different repo names (`acme/a` vs `acme/b`, both `main--<hash>`) → distinct names
    (`a/main` vs `b/main`);
  - **accepted owner-crossing collision** (Codex regression): the same repo name under two different
    owners (`acme/widget` vs `other/widget`, both `main--<hash>`) → the SAME deterministic name
    (`widget/main`) — the owner is intentionally not folded in;
  - **accepted same-repo collision** (Codex regression): two `<wt-id>`s in one repo that strip to
    the same slug → the same deterministic name.
  Run and watch them fail (red).
- [x] 1.2 In `apps/server/src/sessions/orchestrator.test.ts`, change the launch assertion (the
  `command:` deep-equal in "launches a detached session … running claude --remote-control") to
  expect the **named** launch command for `REPO = acme/widget-factory`,
  `WT_ID = feature-login--0123456789ab`:
  `['claude', '--remote-control=widget-factory/feature-login', '--name', 'widget-factory/feature-login']`.
  Run and watch it fail (red).

## 2. Fix

- [x] 2.1 Add `sessionDisplayName(repoId, wtId)` to `packages/shared/src/sessions.ts` (beside
  `tmuxSessionName`): compose `` `${repo}/${slug}` `` where `repo` is the repository name (the
  segment after the owner in `<repo-id>`) and `slug` is `wtId.replace(/--[0-9a-f]{12}$/, '')` (safe
  because `slugForBranch` collapses separator runs, so `--` appears only before the hash). Pure,
  browser-safe, forward-only (never decodes the branch). Export it from the package barrel. Run
  1.1 → green.
- [x] 2.2 In `apps/server/src/sessions/orchestrator.ts`, replace the static `CLAUDE_LAUNCH_COMMAND`
  constant with a per-launch builder
  `claudeLaunchCommand(name) → ['claude', \`--remote-control=${name}\`, '--name', name]`
  (the `=` form is required — `--remote-control` takes an *optional* value that commander won't bind
  space-separated). In `launchSession`, compute `const displayName = sessionDisplayName(repoId, wtId)`
  and pass the built argv to BOTH `tmuxRunner.newSession(name, path, …)` and the `session.argv`
  telemetry attribute. Run 1.2 → green.
- [x] 2.3 Confirm the rewritten "argv, not a shell line" guarantee under hostile input: the slug/name
  derives from a validated `<repo-id>` and a path-safe `<wt-id>` and is passed as argv (never a shell
  line). Assert it in the tmux-seam / orchestrator tests if not already covered.
- [x] 2.4 Verify telemetry redaction end-to-end: the derived display name now in `session.argv` stays
  masked by the outright `session.*` blocklist (`telemetry.ts:58`). In
  `apps/server/src/sessions/no-leak.test.ts`, add an explicit no-leak assertion that the exact
  `sessionDisplayName(repoId, wtId)` value (e.g. `widget-factory/feature-secret-embargo`) appears in
  NO span — neither caught by `telemetry.containsSecret(displayName)` nor present as a raw attribute
  value — alongside the existing tmux-name / path / `<wt-id>` / slug / branch assertions. No blocklist
  change expected (the name rides only inside `session.argv`, already covered by `session.*`).
- [x] 2.5 Run `just typecheck`, `just lint`, and `just test`; confirm the full suite (incl. the
  unchanged tmux-seam forwarding tests) is green.
