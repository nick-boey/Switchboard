import type { InferRequestType, InferResponseType } from 'hono/client';
import type { ServerClient } from './client.js';

/**
 * Compile-time contract guard (design Decision 4).
 *
 * This module emits no runtime code — it is a set of type-level assertions that `tsc -b`
 * (the `just typecheck` / build gate) evaluates. The typed client is derived from the
 * server's `AppType`, so if a route's request/response schema drifts away from the pinned
 * contract below, the build FAILS here. The runtime `contract.test.ts` exercises the same
 * route end-to-end through the client.
 */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type EchoPost = ServerClient['echo']['$post'];

type EchoRequest = InferRequestType<EchoPost>['json'];
type EchoResponse = InferResponseType<EchoPost, 200>;

// If the placeholder route's Zod schema or handler output changes, these break the build.
export type _EchoRequestContract = Expect<Equal<EchoRequest, { message: string }>>;
export type _EchoResponseContract = Expect<
  Equal<EchoResponse, { message: string; length: number }>
>;
