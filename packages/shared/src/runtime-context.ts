/**
 * The single context object services and the server receive (design Decision 2).
 *
 * No host-global paths are read inside service code — everything a service needs comes in
 * via `RuntimeContext`, which preserves the container-per-user path and lets tests inject
 * fakes (see `makeTestContext`). `loadConfig()` (Decision 6) is SEPARATE from `start(ctx)`;
 * this module only declares the shape that `start(ctx)` consumes.
 */

// The parsed, validated `~/.switchboard` config (Zod-inferred). `loadConfig()` produces it
// and `start(ctx)` consumes it off the context — see `./config.ts` and `./load-config.ts`.
export type { AppConfig } from './config.js';
import type { AppConfig } from './config.js';

/** Minimal structured logger seam. Section 5 wires the concrete logger. */
export interface RuntimeLogger {
  debug(message: string, attrs?: Record<string, unknown>): void;
  info(message: string, attrs?: Record<string, unknown>): void;
  warn(message: string, attrs?: Record<string, unknown>): void;
  error(message: string, attrs?: Record<string, unknown>): void;
}

/** A started telemetry span; ends on `end()`. */
export interface RuntimeSpan {
  end(): void;
}

/** Minimal telemetry seam. Section 5 replaces this with the OTel tracer + redaction. */
export interface RuntimeTelemetry {
  startSpan(name: string, attrs?: Record<string, unknown>): RuntimeSpan;
}

/** The principal a request resolved to. Section 4's auth gate populates this. */
export interface RuntimeIdentity {
  /** Allowlisted login (e.g. `nick-boey@github`) or `null` for the bearer/anonymous path. */
  login: string | null;
  /** Which path admitted the request. */
  source: 'serve' | 'bearer' | 'none';
}

/** The runtime context passed to `start(ctx)` and every service. */
export interface RuntimeContext {
  workspaceRoot: string;
  config: AppConfig;
  logger: RuntimeLogger;
  telemetry: RuntimeTelemetry;
  identity: RuntimeIdentity;
}

/**
 * Handle returned by `start(ctx)` for graceful shutdown (design Decision 2).
 *
 * TODO(section 2.4): the server entrypoint `start(ctx): Promise<ServerHandle>` lives in
 * `apps/server`; this type is the contract it fulfils.
 */
export interface ServerHandle {
  url: string;
  close(): Promise<void>;
}
