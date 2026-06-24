import type { OperationStatus } from '@switchboard/shared';
import type { SwitchboardClient } from '../api/client';

/**
 * Session server-state access for the worktrees-hub slice (design Decision 5), through the typed
 * client/contract from `@switchboard/server` — never a hand-rolled fetch shape. The per-repo
 * liveness query returns the set of live `<wt-id>`s (tmux truth, existence + mapping only); the
 * launch/stop mutations hit their routes. The container wires these into TanStack Query.
 */

/** TanStack Query key for a repository's session-liveness query. */
export function sessionLivenessQueryKey(repoId: string): [string, string] {
  return ['sessions', repoId];
}

/** Fetch the set of `<wt-id>`s with a live session for `repoId` (existence + mapping only). */
export async function fetchLiveSessions(
  client: SwitchboardClient,
  repoId: string,
): Promise<Set<string>> {
  const [owner, repo] = repoId.split('/');
  const res = await client.sessions[':owner'][':repo'].$get({ param: { owner, repo } });
  if (!res.ok) throw new Error(`session list failed: ${res.status}`);
  const body = await res.json();
  return new Set(body.sessions.map((s) => s.wtId));
}

/** Request a launch for a worktree; returns the launch operation status (the transient `starting`). */
export async function requestLaunch(
  client: SwitchboardClient,
  repoId: string,
  wtId: string,
): Promise<OperationStatus> {
  const res = await client.sessions.launch.$post({ json: { repoId, wtId } });
  if (!res.ok) throw new Error(`session launch failed: ${res.status}`);
  return res.json();
}

/** Request a stop (kill) for a worktree's session; idempotent server-side. */
export async function requestStop(
  client: SwitchboardClient,
  repoId: string,
  wtId: string,
): Promise<void> {
  const res = await client.sessions.stop.$post({ json: { repoId, wtId } });
  if (!res.ok) throw new Error(`session stop failed: ${res.status}`);
}
