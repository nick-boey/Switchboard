import type { SessionLaunchStatus, SessionSummary } from '@switchboard/shared';
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

/**
 * Fetch a repository's live sessions, keyed by `<wt-id>` (existence + mapping, plus the optional
 * resolved cloud bridge id per session — `session-web-link`). Returns a `Map` so the worktrees hub
 * reads liveness (`.has`) AND the bridge id (`.get(...).bridgeSessionId`) off ONE list call, and the
 * header live-session count keeps summing `.size` — a single bounded server scan per 4 s poll.
 */
export async function fetchLiveSessions(
  client: SwitchboardClient,
  repoId: string,
): Promise<Map<string, SessionSummary>> {
  const [owner, repo] = repoId.split('/');
  const res = await client.sessions[':owner'][':repo'].$get({ param: { owner, repo } });
  if (!res.ok) throw new Error(`session list failed: ${res.status}`);
  const body = await res.json();
  return new Map(body.sessions.map((s) => [s.wtId, s]));
}

/** Request a launch for a worktree; returns the SESSION launch status (the transient `starting`). */
export async function requestLaunch(
  client: SwitchboardClient,
  repoId: string,
  wtId: string,
): Promise<SessionLaunchStatus> {
  const res = await client.sessions.launch.$post({ json: { repoId, wtId } });
  if (!res.ok) throw new Error(`session launch failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch a worktree's launch-operation status (the `starting`/`error` poll target). The launch POST
 * returns the moment the ledger records a running worker, so the container polls this until the op
 * settles — keeping the plug in `starting` for a slow launch and surfacing an asynchronous launch
 * failure as `error`. `null` when no launch op is recorded yet (404).
 */
export async function fetchLaunchStatus(
  client: SwitchboardClient,
  repoId: string,
  wtId: string,
): Promise<SessionLaunchStatus | null> {
  const [owner, repo] = repoId.split('/');
  const res = await client.sessions[':owner'][':repo'][':wtId'].status.$get({
    param: { owner, repo, wtId },
  });
  // 404 = no launch op recorded yet (the poll keeps waiting). Capture the code into a local so the
  // unreachable `!res.ok` branch doesn't narrow `res` to `never` (the typed union is `200 | 404`).
  const code: number = res.status;
  if (code === 404) return null;
  if (!res.ok) throw new Error(`session launch status failed: ${code}`);
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
