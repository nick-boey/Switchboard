import type { GithubOwner, GithubRepo } from '@switchboard/shared';

/**
 * The `github-repos` provider (design Decisions 1–2). A thin `fetch` client behind an
 * OAuth-ready interface — NOT Octokit — so exactly what is read and logged stays auditable for
 * the no-leak guarantee. The MVP implementation is PAT-backed; the seam keeps an OAuth/keychain
 * swap a later, contained change. GitHub error BODIES are never read, surfaced, or logged: a
 * failure maps to a typed `GitHubError` carrying only its kind (and a rate-limit reset).
 */

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type GitHubErrorKind = 'unauthorized' | 'rate-limited' | 'not-found';

/** A typed GitHub failure. Its message is the kind only — never a GitHub error body. */
export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    /** Rate-limit reset (ISO 8601), present only for `rate-limited`. */
    readonly resetAt?: string,
  ) {
    super(`github ${kind}`);
    this.name = 'GitHubError';
  }
}

export interface GitHubListing {
  /** Selectable owners: the authenticated account (`user`) plus the user's organisations. */
  owners: GithubOwner[];
  /** Accessible repositories, each carrying its owner. */
  repositories: GithubRepo[];
}

/** The OAuth-ready provider seam. Callers depend on this, not the PAT implementation. */
export interface GitHubProvider {
  /** The authenticated account + organisations as selectable owners, plus accessible repos. */
  listResources(): Promise<GitHubListing>;
  /** Repositories scoped to a single owner (the account or one organisation). */
  listRepositories(owner: string): Promise<GithubRepo[]>;
}

export interface PatGitHubProviderOptions {
  token: string;
  /** GitHub REST base URL (defaults to the public API; overridden in tests/E2E). */
  apiBaseUrl?: string;
  /** Injectable fetch (the fake in tests; defaults to the global fetch). */
  fetch?: FetchLike;
}

/** Defensive page cap so a pathological `Link` chain cannot loop unbounded (Decision 2). */
const MAX_PAGES = 50;

/** Extract the `rel="next"` URL from a GitHub `Link` header, or `null`. */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) return m[1];
  }
  return null;
}

export function createPatGitHubProvider(options: PatGitHubProviderOptions): GitHubProvider {
  const base = (options.apiBaseUrl ?? 'https://api.github.com').replace(/\/+$/, '');
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const headers = {
    Authorization: `Bearer ${options.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function request(url: string): Promise<Response> {
    const res = await doFetch(url, { headers });
    if (res.ok) return res;
    // Map by status only — the error body is never read, surfaced, or logged.
    if (res.status === 401) throw new GitHubError('unauthorized');
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      throw new GitHubError(
        'rate-limited',
        Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : undefined,
      );
    }
    if (res.status === 404) throw new GitHubError('not-found');
    throw new Error(`github request failed: ${res.status}`);
  }

  async function fetchAllPages<T>(path: string): Promise<T[]> {
    let url: string | null = `${base}${path}`;
    const out: T[] = [];
    for (let i = 0; url && i < MAX_PAGES; i += 1) {
      const res = await request(url);
      out.push(...((await res.json()) as T[]));
      url = parseNextLink(res.headers.get('link'));
    }
    return out;
  }

  async function listAllRepos(): Promise<GithubRepo[]> {
    const raw = await fetchAllPages<{ name: string; owner: { login: string } }>(
      '/user/repos?per_page=100',
    );
    return raw.map((r) => ({ owner: r.owner.login, name: r.name }));
  }

  return {
    async listResources() {
      const [user, orgs, repositories] = await Promise.all([
        request(`${base}/user`).then((r) => r.json() as Promise<{ login: string }>),
        fetchAllPages<{ login: string }>('/user/orgs?per_page=100'),
        listAllRepos(),
      ]);
      const owners: GithubOwner[] = [
        { login: user.login, kind: 'user' },
        ...orgs.map((o) => ({ login: o.login, kind: 'organisation' as const })),
      ];
      return { owners, repositories };
    },
    async listRepositories(owner) {
      return (await listAllRepos()).filter((repo) => repo.owner === owner);
    },
  };
}
