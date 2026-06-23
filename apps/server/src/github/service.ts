import type { RepoListResponse, RuntimeContext } from '@switchboard/shared';
import {
  createPatGitHubProvider,
  GitHubError,
  type FetchLike,
  type GitHubProvider,
} from './provider.js';

/**
 * The `github-repos` service: resolve the configured PAT into the owner-aware repo-list response,
 * mapping the provider's typed failures onto the response union and reporting `not-configured`
 * when no PAT is present (design Decisions 1–2, 7–8). No GitHub error body ever crosses the wire.
 */

export interface ListGitHubReposDeps {
  /** Override the provider (tests). Otherwise built from `ctx.config.github`. */
  provider?: GitHubProvider;
  /** Override the fetch used by the default provider (tests/E2E fake). */
  fetch?: FetchLike;
}

export async function listGitHubRepos(
  ctx: RuntimeContext,
  deps: ListGitHubReposDeps = {},
): Promise<RepoListResponse> {
  const cfg = ctx.config.github;
  if (!deps.provider && !cfg) return { status: 'not-configured' };

  const provider =
    deps.provider ??
    createPatGitHubProvider({
      // `cfg` is non-null here (the not-configured guard above returned otherwise).
      token: cfg!.token,
      apiBaseUrl: cfg!.apiBaseUrl,
      fetch: deps.fetch,
    });

  try {
    const { owners, repositories } = await provider.listResources();
    return { status: 'ok', owners, repositories };
  } catch (err) {
    if (err instanceof GitHubError) {
      if (err.kind === 'rate-limited') {
        return { status: 'rate-limited', resetAt: err.resetAt ?? new Date().toISOString() };
      }
      return { status: err.kind };
    }
    throw err;
  }
}
