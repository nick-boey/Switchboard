/* eslint-disable @typescript-eslint/no-explicit-any -- Hono's `hc`/`Hono` generics are
   themselves declared with `any` (`Hono<any, any, any>`); mirroring that constraint here is
   the only way to stay structurally compatible with the upstream client factory. */
import { hc } from 'hono/client';
import type { ClientRequestOptions } from 'hono/client';
import type { Hono } from 'hono';

/**
 * Generic typed API client factory (design Decision 4).
 *
 * `packages/shared` cannot take a tsconfig project-reference back to `apps/server` (the
 * server already depends on shared for config — that would be a cycle), so shared exposes a
 * GENERIC creator parameterised by the server's `AppType` via `import type`. The bound,
 * route-mirroring factory lives in `apps/server` (cycle-free) and the contract test pins it.
 */
export type ApiClient<T extends Hono<any, any, any>> = ReturnType<typeof hc<T>>;

export function createApiClient<T extends Hono<any, any, any>>(
  baseUrl: string,
  options?: ClientRequestOptions,
): ApiClient<T> {
  return hc<T>(baseUrl, options);
}
