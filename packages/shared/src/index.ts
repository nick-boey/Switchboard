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
} from './runtime-context.js';

// Config schema (design Decision 6). The Node-only `loadConfig` loader is intentionally NOT
// re-exported here — import it from `@switchboard/shared/node` instead (Codex finding 10.3).
export {
  configSchema,
  githubConfigSchema,
  telemetryConfigSchema,
  telemetryExporterSchema,
  corsConfigSchema,
} from './config.js';
export type { TelemetryExporter, GithubConfig } from './config.js';

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

// Typed API client factory (design Decision 4). Generic over the server's `AppType` to keep
// `packages/shared` free of a project-reference cycle back to `apps/server`.
export { createApiClient } from './client.js';
export type { ApiClient } from './client.js';
