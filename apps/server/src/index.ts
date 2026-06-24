/**
 * `@switchboard/server` public surface.
 *
 * `start(ctx)` (Decision 2) boots the loopback-bound Hono app; `loadConfig()` (Decision 6,
 * in `@switchboard/shared`) runs before it. The typed `AppType` + bound client (Decision 4),
 * auth gate (Decision 3), and OTel instrumentation (Decision 5) are exported from here too.
 */
export { start } from './server.js';
export { createApp } from './app.js';
export type { AppEnv, AppType, CreateAppOptions } from './app.js';
// The tmux seam type — E2E/integration callers inject a fake tmux boundary (no real `claude` login).
export type { TmuxRunner } from './sessions/tmux-runner.js';
export { createServerClient } from './client.js';
export type { ServerClient } from './client.js';
export {
  createSpanExporter,
  createTelemetry,
  redactAttributes,
  RedactingSpanProcessor,
  telemetryMiddleware,
} from './telemetry.js';
export type { Telemetry } from './telemetry.js';
export type { RuntimeContext, ServerHandle } from '@switchboard/shared';
