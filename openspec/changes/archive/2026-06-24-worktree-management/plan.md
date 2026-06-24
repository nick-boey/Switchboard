# Plan: worktree-management

> **Roadmap scaffold.** Records the agreed shape from the programme page so the dependency
> edges are visible. The full planning interview (`/switch-plan`) — including the complete
> design of the canonical path-safe ID scheme — runs when this change is routed to. The
> decisions below are inherited from the programme page.

## Problem

Given a cloned repo, create a **worktree + branch** so a Claude session has a real working
tree to run in. The user may target a branch that **already exists on the remote** or ask
for a **new branch**. Branch names are adversarial (slashes, traversal, spaces, Unicode,
reserved names, excessive length), so the on-disk and tmux identifiers must be derived
safely.

## Architecture summary

Extends the **Git service** in `Switchboard.Api` with worktree creation into
`repos/<repo-id>/worktrees/<wt-id>`, one directory per worktree (there is no default `main`
worktree — every worktree is created explicitly). This change owns the **full design of the
canonical path-safe ID scheme**: the human-readable branch name is stored/displayed
separately, while `<wt-id>` (and, later, the tmux session name) are encoded/hashed to be
path-safe. The mapping (id ↔ owner/repo/branch) is part of the worktree model. Worktree
creation is a long-running operation and runs through the **operation ledger + lock**.

## Plan page

[docs/plans/switchboard/mvp.md](../../../docs/plans/switchboard/mvp.md) — drives this change
(listed in its `openspec-changes` frontmatter); arbiter for cross-change decisions, notably
the shared canonical-ID scheme that `claude-session-launch` reuses for tmux naming.

## Planned architecture

**Architectural impact: yes** (incremental). Extends the Git-service surface inside
`Switchboard.Api` introduced by `repo-clone-browse`; no new container or external. The
LikeC4 overlay `docs/dev/Architecture/Planned/worktree-management.c4` (view ids prefixed
`worktree-management-*`) is **authored during this change's full planning stage** — deferred
here as a roadmap scaffold.

**Authored overlay (implemented, `likec4 validate` green):**

- Added element id (under `Switchboard.Api`, all `#todo`): `Switchboard.Api.worktreeService`
  ("Worktree Service") — extends the Git service with worktree create/list/delete on the
  canonical `slug--hash` id scheme, existing-remote vs new branch, git-derived status, the
  server-side safe-to-delete re-check, and create-time collision detect-and-reject.
- Added relationships (all `#todo`): `worktreeService -> gitService` (operates inside the existing
  bare clone), `worktreeService -> operationLedger` (worktree-typed tracked op + per-repo
  git-mutation lock), `worktreeService -> credentialHelper` (PAT for an existing-remote fetch),
  `worktreeService -> GitHub` (fetches an existing remote branch over HTTPS).
- Added view id: `worktree-management-api` ("worktree-management — API components (planned)").
- Validated: `pnpm --dir site exec likec4 validate --no-layout ../docs/dev/Architecture` → Valid.

## Decisions

Inherited from the programme page: on-disk layout `repos/<repo-id>/worktrees/<wt-id>`; no
default `main` worktree; **path-safe `<wt-id>` derivation** with the human-readable branch
name stored separately; tmux session names later reuse the same scheme; **operation ledger +
lock** for worktree creation; "branch exists on remote" vs "new branch" handled explicitly.
The detailed encoding/hashing algorithm is designed at full planning and E2E-tested against
forks and adversarial branch names.

## Open questions

Deferred to the full planning interview — e.g. the exact encode-vs-hash threshold for
`<wt-id>`, collision handling, and worktree-already-exists semantics.
