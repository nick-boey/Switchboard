import { describe, expect, it } from 'vitest';
import type { RepoTarget } from '@switchboard/shared';
import { groupReposByOrg, repoAnchorId } from './group-repos';

/**
 * Failing-first logic tests for the repositories-home grouping/anchor helpers (task 2.1).
 * `groupReposByOrg` is the single source of the organisation-then-repository ordering shared by the
 * home page and the sidebar, so the two surfaces never diverge; `repoAnchorId` is the collision-proof
 * deep-link target id. Follows the `repo-selection.test.ts` pure-function pattern.
 */
const t = (owner: string, repo: string): RepoTarget => ({ owner, repo });

describe('groupReposByOrg', () => {
  it('returns no groups for empty input', () => {
    expect(groupReposByOrg([])).toEqual([]);
  });

  it('groups a single organisation’s repositories under one group, sorted', () => {
    expect(groupReposByOrg([t('acme', 'web'), t('acme', 'api')])).toEqual([
      { owner: 'acme', repos: [t('acme', 'api'), t('acme', 'web')] },
    ]);
  });

  it('orders organisations then repositories case-insensitively', () => {
    const groups = groupReposByOrg([
      t('Zen', 'beta'),
      t('acme', 'Web'),
      t('acme', 'api'),
      t('Zen', 'Alpha'),
    ]);
    expect(groups.map((g) => g.owner)).toEqual(['acme', 'Zen']);
    expect(groups[0].repos.map((r) => r.repo)).toEqual(['api', 'Web']);
    expect(groups[1].repos.map((r) => r.repo)).toEqual(['Alpha', 'beta']);
  });
});

describe('repoAnchorId', () => {
  it('builds a path-separated id from the target (segments split by `/`)', () => {
    expect(repoAnchorId(t('acme', 'web'))).toBe('repo:acme/web');
  });

  it('is collision-proof for separator-ambiguous pairs (a-b/c vs a/b-c)', () => {
    expect(repoAnchorId(t('a-b', 'c'))).not.toBe(repoAnchorId(t('a', 'b-c')));
  });
});
