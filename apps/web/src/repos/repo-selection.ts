import {
  parseRepoTarget,
  toRepoId,
  type GithubOwner,
  type RepoListResponse,
} from '@switchboard/shared';

/**
 * Pure selection/validation helpers for the New repository screen (design Decision 7). The owner
 * options are the authenticated account plus the user's organisations; a repository is valid when
 * it is in the chosen owner's repos. Clone enables only once both resolve. The From-URL path reuses
 * the shared `parseRepoTarget` (full URL with optional `.git`, or a bare `owner/repo`).
 */

/** Selectable owners (account + organisations); empty unless the listing resolved `ok`. */
export function selectableOwners(listing: RepoListResponse | undefined): GithubOwner[] {
  return listing?.status === 'ok' ? listing.owners : [];
}

/** Repository names for a given owner; empty unless the listing resolved `ok`. */
export function reposForOwner(listing: RepoListResponse | undefined, owner: string): string[] {
  if (listing?.status !== 'ok') return [];
  return listing.repositories.filter((repo) => repo.owner === owner).map((repo) => repo.name);
}

/** True when `owner` is the account or one of the fetched organisations. */
export function isOwnerValid(listing: RepoListResponse | undefined, owner: string): boolean {
  return selectableOwners(listing).some((candidate) => candidate.login === owner);
}

/** True when `repo` is one of `owner`'s repositories in the listing. */
export function isRepoValid(
  listing: RepoListResponse | undefined,
  owner: string,
  repo: string,
): boolean {
  return reposForOwner(listing, owner).includes(repo);
}

/** The `<owner>/<repo>` repo-id for a valid selection, or `null` if either side is invalid. */
export function cloneTargetFromSelection(
  listing: RepoListResponse | undefined,
  owner: string,
  repo: string,
): string | null {
  return isOwnerValid(listing, owner) && isRepoValid(listing, owner, repo)
    ? `${owner}/${repo}`
    : null;
}

/** The `<owner>/<repo>` repo-id parsed from a URL/bare input (trailing `.git` normalized), or null. */
export function cloneTargetFromUrl(input: string): string | null {
  const target = parseRepoTarget(input);
  return target ? toRepoId(target) : null;
}
