// Browser-safe public API surface of @switchboard/shared. The server, web, and cli import
// from here. Anything that touches `node:*` (the config loader) lives in the separate
// `@switchboard/shared/node` entrypoint so the browser build never externalizes Node builtins
// (Codex finding 10.3).
export type {
  AppConfig,
  RuntimeContext,
  RuntimeLogger,
  RuntimeSpan,
  RuntimeTelemetry,
  RuntimeIdentity,
  ServerHandle,
  ServerHandleUrls,
} from './runtime-context.js';

// Config schema (design Decision 6). The Node-only `loadConfig` loader is intentionally NOT
// re-exported here — import it from `@switchboard/shared/node` instead (Codex finding 10.3).
export {
  configSchema,
  githubConfigSchema,
  telemetryConfigSchema,
  telemetryExporterSchema,
  corsConfigSchema,
  listenConfigSchema,
  directIngressSchema,
  serveIngressSchema,
} from './config.js';
export type {
  TelemetryExporter,
  GithubConfig,
  ListenConfig,
  DirectIngressConfig,
  ServeIngressConfig,
} from './config.js';

// Repo-clone-browse slice contracts (design Decisions 5–8).
export {
  parseRepoTarget,
  toRepoId,
  isValidRepoId,
  cloneRequestSchema,
  abortRequestSchema,
  cloneStatusSchema,
  cloneErrorKindSchema,
  cloneErrorSchema,
  operationStatusSchema,
  githubOwnerSchema,
  githubRepoSchema,
  repoListResponseSchema,
} from './repos.js';
export type {
  RepoTarget,
  CloneRequest,
  ParsedCloneRequest,
  AbortRequest,
  CloneStatus,
  CloneErrorKind,
  CloneError,
  OperationStatus,
  GithubOwner,
  GithubRepo,
  RepoListResponse,
} from './repos.js';

// Worktree-management slice contracts + the canonical path-safe ID scheme (design Decisions
// 1, 5, 6, 8). The ID scheme is browser-safe (vendored sync SHA-256, no `node:*`) so it lives in
// this barrel and `claude-session-launch` reuses it for tmux session names.
export {
  idForBranch,
  isValidWorktreeId,
  slugForBranch,
  isSafeBranchName,
  sha256Hex,
  worktreeModeSchema,
  worktreeCreateRequestSchema,
  worktreeSyncSchema,
  worktreeSummarySchema,
  worktreeListResponseSchema,
  worktreeDeleteRequestSchema,
} from './worktrees.js';
export type {
  WorktreeMode,
  WorktreeCreateRequest,
  WorktreeSync,
  WorktreeSummary,
  WorktreeListResponse,
  WorktreeDeleteRequest,
} from './worktrees.js';

// Claude-session-launch slice contracts + the tmux session-name scheme (design Decisions 1, 4,
// 5, 8). `tmuxSessionName` reuses the canonical `slugForBranch` + `sha256Hex` primitives (browser-
// safe) over `(repo-id, wt-id)`, so it lives in this barrel beside `idForBranch`.
export {
  tmuxSessionName,
  isValidTmuxSessionName,
  sessionLaunchRequestSchema,
  sessionStopRequestSchema,
  plugSessionStatusSchema,
  sessionLaunchStateSchema,
  sessionLaunchErrorKindSchema,
  sessionLaunchErrorSchema,
  sessionLaunchStatusSchema,
  isTerminalLaunchState,
  bridgeSessionIdSchema,
  sessionSummarySchema,
  sessionListResponseSchema,
} from './sessions.js';
export type {
  SessionLaunchRequest,
  SessionStopRequest,
  PlugSessionStatus,
  SessionLaunchState,
  SessionLaunchErrorKind,
  SessionLaunchFailure,
  SessionLaunchStatus,
  BridgeSessionId,
  SessionSummary,
  SessionListResponse,
} from './sessions.js';

// Typed API client factory (design Decision 4). Generic over the server's `AppType` to keep
// `packages/shared` free of a project-reference cycle back to `apps/server`.
export { createApiClient } from './client.js';
export type { ApiClient } from './client.js';
