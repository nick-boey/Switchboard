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
  /**
   * Runtime assertion (set by the CLI bootstrap, NOT by config — `runtime-cli-docker`
   * Decisions 3/6): the dedicated serve ingress is bound only inside the container's network
   * namespace and is NOT published to the host. This is the precondition that makes a serve
   * ingress identity-eligible; the per-ingress trust flag is computed at bind time as
   * `trustServeIdentity ∧ is-serve-ingress ∧ assertNoHostPublication`. Defaults to `false`
   * (a host runtime, where any serve ingress is host-reachable and therefore bearer-only).
   */
  assertNoHostPublication?: boolean;
}

/**
 * Per-ingress loopback URLs resolved at bind time (`runtime-cli-docker` Decision 2). `direct`
 * is present when the listen spec includes the direct/local loopback-TCP ingress; `serve` is
 * present when it includes the dedicated serve ingress.
 */
export interface ServerHandleUrls {
  direct?: string;
  serve?: string;
}

/**
 * Handle returned by `start(ctx)` for graceful shutdown (foundations Decision 2; the dual
 * ingress is `runtime-cli-docker` Decision 2).
 *
 * `url` reports the primary loopback URL — the direct ingress when one is present, otherwise the
 * serve ingress. `urls` exposes each configured ingress's resolved loopback URL (so a caller can
 * reach the serve port even when it was bound ephemerally). `close()` releases EVERY listener.
 */
export interface ServerHandle {
  url: string;
  urls: ServerHandleUrls;
  close(): Promise<void>;
  /**
   * Settles when the server stops on its OWN — i.e. unexpectedly, not via a supervisor-initiated
   * `close()` (`runtime-cli-docker` Decision 5). The CLI supervisor races this against shutdown
   * signals: if it settles, the server crashed and is restarted with bounded backoff. A graceful
   * `close()` does NOT settle it. Optional: a handle that cannot surface a crash omits it.
   */
  whenClosed?: Promise<void>;
}
