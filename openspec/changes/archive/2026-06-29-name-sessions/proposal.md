## Why

Switchboard launches `claude --remote-control` with no session name, so each launched
session shows an auto-generated label (a UUID / conversation summary, and a
hostname-prefixed Remote Control name) instead of the worktree it belongs to — making
sessions hard to tell apart in Claude's Remote Control list, the `/resume` picker, and
the terminal/tmux title. A session should announce its branch.

## Root cause

The detached launch argv is the static constant
`CLAUDE_LAUNCH_COMMAND = ['claude', '--remote-control']`
(`apps/server/src/sessions/orchestrator.ts:41`), passed verbatim to
`tmuxRunner.newSession(name, path, [...CLAUDE_LAUNCH_COMMAND])` (`orchestrator.ts:188`).
The `claude` CLI **does** support naming a session — `-n, --name <name>` sets the
display name shown in the prompt box, `/resume` picker, and terminal title, and
`--remote-control [name]` names the Remote Control session (otherwise auto-named from
`--remote-control-session-name-prefix`, default hostname). The orchestrator simply never
passes one.

A human-readable, non-sensitive name is already in hand at launch: `launchSession` keys
on `(repoId, wtId)`, and `<wt-id> = <slug>--<hash>` where `slug = slugForBranch(branch)`
(`packages/shared/src/worktrees.ts:57`). The recognisable branch slug is therefore
recoverable by stripping the trailing `--<12-hex>` suffix from the `<wt-id>` — without
touching the exact git branch, which the slice deliberately treats as sensitive and
never carries (`packages/shared/src/sessions.ts:34`, telemetry redaction Decision 7).
Because `<wt-id>` is a function of the branch alone, the **repository name** is folded in
too — echoing how `tmuxSessionName` keys on `(repoId, wtId)`, though without its full
`<owner>/<repo>` qualification or disambiguating hash — so the same branch launched in two
differently-named repositories does not produce the same name. Two repositories that share
a name under different owners (e.g. `acme/widget` vs `other/widget`) collapse to the same
name; that owner-crossing collision is accepted as out of scope, alongside the
case-folding and length-cap slug collisions noted below.

## What Changes

- Append a display name to the detached launch argv so the launched session is named
  after its repository and worktree. The name is `<repo>/<branch-slug>` — the repository
  name plus the `<wt-id>` with its `--<hash>` suffix removed (e.g. repo
  `acme/widget-factory` + `name-sessions--7130389dc45a` → `widget-factory/name-sessions`).
  The slug is the same lossy, path-safe value already shown in the worktree directory and
  tmux name (lowercased, `/`→`-`), and the repository name is folded in (echoing
  `tmuxSessionName`'s `(repoId, wtId)` key, but without its owner qualification or
  disambiguating hash) so the same branch across two differently-named repos stays distinct.
  Residual collisions (same repo name under different owners; case-folding branch pairs;
  length-capped slugs within one repo) are accepted as out of scope and covered by a
  deterministic-naming scenario/test.
- Feed that slug to both naming surfaces the CLI exposes, so the name is consistent
  everywhere a user looks: `--name <slug>` (prompt box, `/resume` picker, terminal/tmux
  title) and `--remote-control=<slug>` (the Remote Control session label that Switchboard's
  access path surfaces). Exact argv token forms are pinned in tasks.
- Derive the name with a small pure, browser-safe helper `sessionDisplayName(repoId, wtId)`
  (parallel to `tmuxSessionName`) that composes `<repo>/<branch-slug>`, keeping the
  forward-only, never-decode-the-branch invariant.
- No telemetry change: the name rides inside the launch argv, logged only under the
  already-blocklisted `session.argv` key, alongside the existing branch-derived
  `session.name`. The fix verifies the slug reaches no non-blocklisted span attribute.

## Capabilities

### Modified Capabilities
- `session-launch`: the "Launch a Claude session detached in a worktree's tmux session"
  requirement is modified so the launch command **names the Claude session
  `<repo>/<branch-slug>`** (derived forward from `(repo-id, wt-id)`, repository name folded in
  for distinctness across differently-named repos — no owner, no hash, so owner-crossing
  name collisions are accepted) on both naming surfaces via the exact argv
  `['claude', '--remote-control=<name>', '--name', '<name>']` (the `=` form is required —
  `--remote-control` takes an optional value); the argv-not-a-shell-line and
  telemetry-redaction guarantees are preserved (the derived name is named as sensitive and
  asserted to never escape unredacted), and the argv scenario is tightened to the real
  hostile-input path (exact branch → safe `<wt-id>` → safe name as argv).

## Impact

- `packages/shared/src/sessions.ts` (beside `tmuxSessionName`) — new pure helper
  `sessionDisplayName(repoId, wtId)` composing `<repo>/<branch-slug>` (repo from `<repo-id>`,
  slug from `<wt-id>` minus its `--<hash>` suffix); exported via the barrel; unit tests in
  `packages/shared/src/sessions.test.ts`.
- `apps/server/src/sessions/orchestrator.ts` — `CLAUDE_LAUNCH_COMMAND` becomes a
  per-launch argv that appends the name flags; the `tmuxRunner.newSession` call and the
  `session.argv` telemetry span use the built argv.
- Tests asserting the launch argv: `apps/server/src/sessions/orchestrator.test.ts`,
  `apps/server/src/sessions/tmux-runner.test.ts`,
  `apps/server/src/testing/tmux-runner.test.ts`.
- `apps/server/src/telemetry.ts` — confirm (no change expected) that the name remains
  covered by the `session.*` redaction blocklist.
