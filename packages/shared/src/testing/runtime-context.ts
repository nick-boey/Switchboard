import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema } from '../config.js';
import type {
  RuntimeContext,
  RuntimeIdentity,
  RuntimeLogger,
  RuntimeTelemetry,
} from '../runtime-context.js';

const noopLogger: RuntimeLogger = {
  debug(): void {},
  info(): void {},
  warn(): void {},
  error(): void {},
};

const noopTelemetry: RuntimeTelemetry = {
  startSpan: () => ({ end(): void {} }),
};

const anonymousIdentity: RuntimeIdentity = {
  login: null,
  source: 'none',
};

/**
 * The test-double seam (design Decision 2 / task 1.4): build a `RuntimeContext` populated
 * with safe fakes so services and the server can take injected dependencies via `ctx`.
 *
 * `workspaceRoot` defaults to a fresh temp dir. `config` is a placeholder until section 2
 * supplies the parsed `AppConfig`. Override any field via `overrides`.
 */
export function makeTestContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    workspaceRoot: mkdtempSync(join(tmpdir(), 'switchboard-test-')),
    // A valid, parsed AppConfig with a fixed test bearer token and secure defaults.
    config: configSchema.parse({ bearerToken: 'test-bearer-token' }),
    logger: noopLogger,
    telemetry: noopTelemetry,
    identity: anonymousIdentity,
    ...overrides,
  };
}
