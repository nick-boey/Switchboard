import { toRepoId, type RepoTarget } from '@switchboard/shared';

/**
 * Pure grouping/anchor helpers for the repositories home (design Decisions: "Presentational view +
 * container split" and "Anchors via DOM fragment ids"). `groupReposByOrg` is the SINGLE source of
 * the organisation-then-repository ordering consumed by both the home page and the sidebar, so the
 * two surfaces never diverge. `repoAnchorId` is the collision-proof deep-link target id.
 */

/** A repositories group: one organisation (owner) and its repositories, repo-sorted. */
export interface RepoOrgGroup {
  owner: string;
  repos: RepoTarget[];
}

/** Case-insensitive comparison (`localeCompare` base sensitivity) for owner/repo names. */
function compareInsensitive(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * Group repositories by organisation (owner), ordering organisations then the repositories within
 * each organisation case-insensitively. Empty input yields no groups.
 */
export function groupReposByOrg(repos: RepoTarget[]): RepoOrgGroup[] {
  const byOwner = new Map<string, RepoTarget[]>();
  for (const target of repos) {
    const list = byOwner.get(target.owner) ?? [];
    list.push(target);
    byOwner.set(target.owner, list);
  }
  return [...byOwner.entries()]
    .sort(([a], [b]) => compareInsensitive(a, b))
    .map(([owner, list]) => ({
      owner,
      repos: [...list].sort((a, b) => compareInsensitive(a.repo, b.repo)),
    }));
}

/**
 * A stable, collision-proof DOM id for a repository's home section — the deep-link target. A naïve
 * `repo-<owner>-<repo>` collides because the owner/repo charset permits `-`, `_`, and `.` (so `a-b/c`
 * and `a/b-c` would share an id). We keep the segments unambiguously separated by `/` — which neither
 * segment can contain — prefixing the canonical `<owner>/<repo>` repo-id with `repo:`. Lookups use
 * `getElementById` (not a CSS selector), so the `:`/`/` characters need no escaping.
 */
export function repoAnchorId(target: RepoTarget): string {
  return `repo:${toRepoId(target)}`;
}
