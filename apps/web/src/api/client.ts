import { createApiClient, type ApiClient } from '@switchboard/shared';
// Type-only import of the server's route type (design Decision 4). `packages/shared` owns the
// GENERIC `createApiClient<T>`; the concrete `AppType` lives in `apps/server` and is published
// from its package main as a STABLE type-only contract (Codex finding 10.2). The web app is a
// separate consumer that takes a dev-only / project-reference dependency on the server and pulls
// `AppType` purely as a type — the `import type` is erased at build time, leaving the client
// fully typed against the real server routes with zero runtime coupling (the web bundle ships no
// server code). The bound `createServerClient` (Decision 4) is the server-side equivalent.
import type { AppType } from '@switchboard/server';
import { readRuntimeConfig, type SwitchboardRuntimeConfig } from './config';

export type SwitchboardClient = ApiClient<AppType>;

/**
 * Build the typed `hc` client (design Decision 4) for the configured server, attaching the
 * bearer token (Decision 3) to every request. Mirrors the server routes via `AppType`.
 */
export function createSwitchboardClient(
  config: SwitchboardRuntimeConfig = readRuntimeConfig(),
): SwitchboardClient {
  return createApiClient<AppType>(config.serverUrl, {
    headers: { Authorization: `Bearer ${config.bearerToken}` },
  });
}
