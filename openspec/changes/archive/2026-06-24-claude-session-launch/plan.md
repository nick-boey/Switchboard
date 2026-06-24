# Plan: claude-session-launch

> **Roadmap scaffold.** Records the agreed shape from the programme page so the dependency
> edges are visible. The full planning interview (`/switch-plan`) runs when this change is
> routed to. The decisions below are inherited from the programme page.

## Problem

Launch a remote-control-enabled Claude Code session in a chosen worktree — the whole point of
Switchboard. The session must run **detached** so it survives the request, and Switchboard
must be able to **list/track** which sessions exist and which worktree each maps to. Driving
the conversation stays in the official Claude mobile app.

## Architecture summary

Adds a **Session service** to `Switchboard.Api` that launches `claude --remote-control`
**detached in a `tmux` session** rooted in `repos/<repo-id>/worktrees/<wt-id>`, realizing the
base model's `#planned` `Switchboard.Api -> TmuxHost` relationship. tmux session names reuse
the **canonical path-safe scheme** from `worktree-management` (no raw `sb-<repo>-<branch>`).
Switchboard tracks **session existence + worktree mapping only** — conversation metadata
(model, context, last message) is the mobile app's domain. `claude` rides the host's existing
login (no per-session pairing UI). Launch is a long-running operation through the **operation
ledger + lock**.

## Plan page

[docs/plans/switchboard/mvp.md](../../../docs/plans/switchboard/mvp.md) — drives this change
(listed in its `openspec-changes` frontmatter); arbiter for cross-change decisions.

## Planned architecture

**Architectural impact: yes.** Realizes the base model's `#planned`
`Switchboard.Api -> TmuxHost` relationship and introduces the Session-service concept inside
`Switchboard.Api`. The LikeC4 overlay
`docs/dev/Architecture/Planned/claude-session-launch.c4` (extending `Switchboard.Api`, view
ids prefixed `claude-session-launch-*`) is **authored during this change's full planning
stage** — deferred here as a roadmap scaffold. The Architecture review checkpoint fires when
that overlay lands.

**Added by the overlay (`docs/dev/Architecture/Planned/claude-session-launch.c4`, all `#todo`):**

- Elements (components of `Switchboard.Api`): `sessionService`, `sessionProbe`.
- Relationships: `sessionService -> operationLedger`, `sessionService -> worktreeService`,
  `sessionService -> sessionProbe`, `worktreeService -> sessionProbe` (the safe-to-delete
  `hasActiveSession` seam — the only worktree→session edge, pointing at the back-edge-free probe),
  `sessionService -> TmuxHost` and `sessionProbe -> TmuxHost` (realizing the base `#planned`
  `Switchboard.Api -> TmuxHost`).
- View id: `claude-session-launch-api`.

## Decisions

Inherited from the programme page: launch `claude --remote-control` **detached in tmux**;
tmux names use the **path-safe scheme** from `worktree-management`; track **session existence
+ worktree mapping only** (no conversation metadata, no DB); `claude` uses the host's existing
login (the remote-control auth spike is intentionally skipped); **operation ledger + lock**
for launch.

## Open questions

Deferred to the full planning interview — e.g. detecting/representing a dead vs live tmux
session, relaunch semantics, and how session listing reconciles tmux truth with the worktree
mapping after a host restart.
