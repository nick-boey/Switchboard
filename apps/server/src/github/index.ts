/** The `github-repos` slice: an OAuth-ready provider (PAT impl) + the listing service. */
export { listGitHubRepos } from './service.js';
export type { ListGitHubReposDeps } from './service.js';
export { createPatGitHubProvider, GitHubError } from './provider.js';
export type {
  GitHubProvider,
  GitHubListing,
  GitHubErrorKind,
  FetchLike,
  PatGitHubProviderOptions,
} from './provider.js';
