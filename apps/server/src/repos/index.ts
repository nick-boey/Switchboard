/** The `repo-clone` slice: clone orchestration, Git service, credential helper, git runner. */
export { createCloneOrchestrator } from './clone.js';
export type { CloneOrchestrator, CloneOrchestratorDeps } from './clone.js';
export { createGitService, cloneUrlFor } from './git-service.js';
export type { GitService, GitServiceDeps, CloneOptions } from './git-service.js';
export { createGitRunner, GitCloneError, classifyGitStderr } from './git-runner.js';
export type { GitRunner, GitRunOptions, GitCaptureResult } from './git-runner.js';
export {
  writeGithubToken,
  ensureCredentialHelperScript,
  credentialHelperArgs,
  TOKEN_FILE_NAME,
  HELPER_SCRIPT_NAME,
  TOKEN_FILE_ENV,
} from './credential-helper.js';
