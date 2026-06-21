import { createApiClient, type ApiClient } from '@switchboard/shared';
import type { ClientRequestOptions } from 'hono/client';
import type { AppType } from './app.js';

/**
 * The bound, route-mirroring typed client (design Decision 4).
 *
 * `packages/shared` owns the GENERIC `createApiClient<T>` (it cannot reference `apps/server`
 * without a project-reference cycle). This module — which already lives in `apps/server` and
 * can see `AppType` — binds it to the server routes. `contract.ts` pins the resulting shape
 * so client/server drift fails the build.
 */
export type ServerClient = ApiClient<AppType>;

export function createServerClient(baseUrl: string, options?: ClientRequestOptions): ServerClient {
  return createApiClient<AppType>(baseUrl, options);
}
