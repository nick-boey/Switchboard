/** The `repo-clone` slice: the Git service, credential helper, and git-subprocess runner. */
export { createGitService, cloneUrlFor } from './git-service.js';
export type { GitService, GitServiceDeps, CloneOptions } from './git-service.js';
export { createGitRunner } from './git-runner.js';
export type { GitRunner, GitRunOptions } from './git-runner.js';
export {
  writeGithubToken,
  ensureCredentialHelperScript,
  credentialHelperArgs,
  TOKEN_FILE_NAME,
  HELPER_SCRIPT_NAME,
  TOKEN_FILE_ENV,
} from './credential-helper.js';
