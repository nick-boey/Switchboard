## Why

The header's live-session indicator always shows `0`, regardless of how many sessions are
actually live, because the displayed count is never wired to real session data.

## Root cause

`AppShell` exposes a **display-only** `liveSessions` prop that defaults to `0`
(`apps/web/src/components/AppShell.tsx:32,43`) and renders it in the header indicator
(`AppShell.tsx:110-117`). Production mounts `<AppShell />` with no props
(`apps/web/src/main.tsx`), so the prop keeps its `0` default permanently. The per-repo
liveness infrastructure already exists — `fetchLiveSessions(client, repoId)` returns the set
of live `<wt-id>`s for a repo (`apps/web/src/sessions/session-queries.ts:17-26`), and
`AppShell` already runs the `['cloned-repos']` query — but **nothing aggregates per-repo
liveness into the header count**. The indicator therefore renders the constant default.

## What Changes

Compute the header live-session count in `AppShell` from real data: aggregate per-repo
session-liveness across the cloned repositories already fetched by the `['cloned-repos']`
query — summing each repo's live `<wt-id>` count via the existing `fetchLiveSessions` /
`['sessions', <repo-id>]` queries — and feed that total to the existing header indicator.
The display-only `liveSessions` prop remains the Storybook/test injection seam; production now
supplies a real, derived value rather than relying on the `0` default. Data access stays on
TanStack Query + the typed client (no hand-rolled fetch shapes). Like the worktree plug, the
header self-corrects from tmux truth on the next liveness read.

## Capabilities

### Modified Capabilities

- `session-list`: (1) **modify** the existing "Session liveness and listing derive from tmux
  truth" requirement to widen its allowed-consumers clause — the capability now also serves the
  web app's aggregate header live-session count, not only the per-worktree plug and the
  safe-to-delete `SessionProbe` seam; and (2) **add** a regression requirement that the header
  live-session count reflects the **aggregate** of live sessions across all cloned repositories
  (driven by the same liveness data as the per-worktree plug), self-corrects on the next liveness
  read, and never renders a constant `0` when sessions are live.

## Impact

- `apps/web/src/components/AppShell.tsx` — derive the header count from aggregated per-repo
  liveness instead of the unused `0` default; pass the derived total to the existing indicator.
- `apps/web/src/sessions/` — a small aggregation helper/hook over `fetchLiveSessions` and the
  `['cloned-repos']` list (co-located with the existing session queries), plus its unit test.
- `apps/web/src/components/AppShell.test.tsx` — extend coverage so the regression (count wired
  from real liveness, not a hardcoded `0`) is locked.
- **No** server or `packages/shared` change — the existing per-repo `/sessions/:owner/:repo`
  endpoint and typed client already provide the data.
