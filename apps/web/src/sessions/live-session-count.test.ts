import { describe, expect, it } from 'vitest';
import type { RepoTarget } from '@switchboard/shared';
import type { SwitchboardClient } from '../api/client';
import { aggregateLiveSessionCount, liveSessionCountQueries } from './live-session-count';
import { sessionLivenessQueryKey } from './session-queries';

/**
 * Header live-session count (fix-live-session-indicator). The count is the aggregate of every
 * cloned repository's live `<wt-id>`s. `aggregateLiveSessionCount` is the pure sum (undefined =
 * not-yet-loaded = 0); `liveSessionCountQueries` builds one liveness query per repo under the SAME
 * `sessionLivenessQueryKey` the worktrees hub uses, with the hub's `refetchInterval`, so the header
 * shares that cache and self-corrects from tmux truth on the next read rather than a one-shot fetch.
 */
describe('aggregateLiveSessionCount', () => {
  it('is 0 when there are no repositories', () => {
    expect(aggregateLiveSessionCount([])).toBe(0);
  });

  it('is 0 when no repository has a live session', () => {
    expect(aggregateLiveSessionCount([new Set(), new Set()])).toBe(0);
  });

  it("counts a single repository's live sessions", () => {
    expect(aggregateLiveSessionCount([new Set(['a--0123456789ab', 'b--abcdef012345'])])).toBe(2);
  });

  it('aggregates the count across repositories', () => {
    expect(
      aggregateLiveSessionCount([
        new Set(['a--0123456789ab', 'b--abcdef012345']),
        new Set(['c--1']),
      ]),
    ).toBe(3);
  });

  it('treats a not-yet-loaded repository (undefined) as 0', () => {
    expect(aggregateLiveSessionCount([new Set(['a--0123456789ab']), undefined])).toBe(1);
  });

  it("decreases when a repository's live set shrinks (self-correction)", () => {
    const before = aggregateLiveSessionCount([new Set(['a--1', 'b--2']), new Set(['c--3'])]);
    const after = aggregateLiveSessionCount([new Set(['a--1']), new Set(['c--3'])]);
    expect(before).toBe(3);
    expect(after).toBe(2);
    expect(after).toBeLessThan(before);
  });
});

describe('liveSessionCountQueries', () => {
  const repos: RepoTarget[] = [
    { owner: 'acme', repo: 'infra' },
    { owner: 'nick-boey', repo: 'switchboard' },
  ];
  const client = {} as SwitchboardClient;

  it('builds one query per repository under the shared session-liveness key (not a one-shot fetch)', () => {
    const queries = liveSessionCountQueries(client, repos);
    expect(queries).toHaveLength(2);
    expect(queries[0].queryKey).toEqual(sessionLivenessQueryKey('acme/infra'));
    expect(queries[1].queryKey).toEqual(sessionLivenessQueryKey('nick-boey/switchboard'));
  });

  it('polls each repository so the count self-corrects on the next liveness read', () => {
    const queries = liveSessionCountQueries(client, repos);
    for (const q of queries) expect(q.refetchInterval).toBe(4000);
  });

  it('is empty when there are no cloned repositories', () => {
    expect(liveSessionCountQueries(client, [])).toEqual([]);
  });
});
