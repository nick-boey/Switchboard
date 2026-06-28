import { useQueries, type UseQueryOptions } from '@tanstack/react-query';
import { toRepoId, type RepoTarget } from '@switchboard/shared';
import type { SwitchboardClient } from '../api/client';
import { fetchLiveSessions, sessionLivenessQueryKey } from './session-queries';

/**
 * Header live-session count (fix-live-session-indicator). The header shows the aggregate number of
 * live sessions across every cloned repository. There is no global sessions endpoint — liveness is
 * per repo — so we run one liveness query per cloned repo under the SAME
 * `sessionLivenessQueryKey` the worktrees hub uses, with the hub's `refetchInterval`. Sharing the
 * key means the header reads the hub's cache, picks up the invalidations the hub fires after
 * launch/stop, and self-corrects from tmux truth on the next read (rather than a one-shot fetch).
 */

/** Re-read cadence for the header's per-repo liveness queries — matches the worktrees hub. */
const HEADER_LIVENESS_REFETCH_MS = 4000;

/** Per-repo liveness query options keyed by the shared `sessionLivenessQueryKey` (existence only). */
export function liveSessionCountQueries(
  client: SwitchboardClient,
  repos: readonly RepoTarget[],
): UseQueryOptions<Set<string>, Error, Set<string>, readonly [string, string]>[] {
  return repos.map((repo) => {
    const repoId = toRepoId(repo);
    return {
      queryKey: sessionLivenessQueryKey(repoId),
      queryFn: () => fetchLiveSessions(client, repoId),
      refetchInterval: HEADER_LIVENESS_REFETCH_MS,
    };
  });
}

/** Sum the live `<wt-id>` counts across repos; a not-yet-loaded repo (`undefined`) contributes 0. */
export function aggregateLiveSessionCount(
  liveSets: ReadonlyArray<ReadonlySet<string> | undefined>,
): number {
  return liveSets.reduce<number>((sum, set) => sum + (set?.size ?? 0), 0);
}

/** Aggregate live-session count across the given cloned repos (self-correcting via the shared key). */
export function useLiveSessionCount(
  client: SwitchboardClient,
  repos: readonly RepoTarget[],
): number {
  const results = useQueries({ queries: liveSessionCountQueries(client, repos) });
  return aggregateLiveSessionCount(results.map((r) => r.data));
}
