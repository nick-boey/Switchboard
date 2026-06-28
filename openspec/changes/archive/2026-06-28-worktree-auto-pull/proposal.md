## Why

Creating a worktree currently checks out a stale local branch — the base (or existing
branch) is never refreshed from the remote, so new worktrees start out behind `origin`
even when fresh commits exist upstream.

## Root cause

`createWorktree` in `apps/server/src/worktrees/git-worktree.ts` builds the checkout from
local refs that are never fast-forwarded:

- **`mode: 'new'`** (`git-worktree.ts:342-345`): there is no `fetch` at all. The new
  branch is cut from `input.base ?? defaultBranch(bare)`, a purely **local** ref. Since
  nothing updates that ref from the remote, the new branch is based on whatever tip the
  bare repo last happened to see.
- **`mode: 'existing-remote'` with a pre-existing local branch** (`git-worktree.ts:348-351`):
  `fetchOrigin` updates `refs/remotes/origin/<branch>`, but the worktree is then added
  against the **local** `refs/heads/<branch>` (`worktree add <path> <branch>`), which is
  not fast-forwarded — so the checkout reflects the stale local tip, not the freshly
  fetched remote one. (The sub-path that creates the branch fresh from `origin/<branch>`
  at `git-worktree.ts:352-366` is already correct.)

In short: a `fetch` either does not happen (`new`) or does not propagate to the checked-out
ref (`existing-remote` with a local branch).

## What Changes

- Add a reusable service-level operation that refreshes a single local branch from its
  remote: fetch `origin`, then **fast-forward only** the local branch ref to its
  remote-tracking counterpart. On divergence (local-only commits), leave the local branch
  untouched and proceed — never discard local work. On an unreachable remote / fetch
  failure, proceed best-effort with the existing local tip. It is exposed as a standalone
  function (callable independently of creation) so a future manual "pull" button can reuse
  it without duplicating logic.
- Wire it into `createWorktree`:
  - `mode: 'new'`: refresh the **base** branch before cutting the new branch.
  - `mode: 'existing-remote'` with an existing local branch: refresh that branch before
    `worktree add`.
- Keep the already-correct `origin/<branch>` fresh-checkout path as-is.

## Capabilities

### Modified Capabilities
- `worktree-management`: MODIFIED requirement — worktree creation produces a checkout based
  on the up-to-date remote state of its branch (fast-forward-only refresh, best-effort when
  offline), plus a regression scenario guarding against creating a worktree from a stale
  local base. The refresh behaviour is specified independently of its trigger so the same
  guarantee covers a future manual trigger.

## Impact

- **Code**: `apps/server/src/worktrees/git-worktree.ts` (`createWorktree`; new
  branch-refresh helper alongside `fetchOrigin`/`refExists`/`defaultBranch`). No contract,
  route, or schema changes (`packages/shared`, `apps/server/src/app.ts` untouched) — no new
  endpoint in this change.
- **Behaviour**: worktrees start up-to-date with the remote; offline creation still works
  (stale base) and divergent local branches are preserved.
- **Telemetry**: any warning surfaced for a failed/skipped refresh must respect redaction —
  branch names and paths stay out of span attributes and logs (`apps/server/telemetry.ts`
  blocklist).
- **Tests**: extend `apps/server/src/worktrees/git-worktree.test.ts` using the real
  temp-git fixture (`apps/server/src/testing/worktree-fixture.ts`) — assert fresh-remote
  checkout for both modes, fast-forward-only on divergence, and best-effort on fetch
  failure.
