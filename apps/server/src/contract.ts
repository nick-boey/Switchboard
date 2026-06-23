import type { InferRequestType, InferResponseType } from 'hono/client';
import type { OperationStatus, RepoListResponse, RepoTarget } from '@switchboard/shared';
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

// --- repo-clone-browse routes (design Decision 4) ---------------------------
// The typed client mirrors every repo route; drift from the shared schemas fails the build here.

type ClonePost = ServerClient['repos']['clone']['$post'];
type AbortPost = ServerClient['repos']['abort']['$post'];
type ClonedGet = ServerClient['repos']['cloned']['$get'];
type GithubGet = ServerClient['repos']['github']['$get'];
type StatusGet = ServerClient['repos'][':owner'][':repo']['status']['$get'];

// The client sends `{ target }` / `{ repoId }` (the schema INPUT), not the transformed output.
export type _CloneRequestContract = Expect<
  Equal<InferRequestType<ClonePost>['json'], { target: string }>
>;
export type _AbortRequestContract = Expect<
  Equal<InferRequestType<AbortPost>['json'], { repoId: string }>
>;

// Every operation-bearing route returns the shared `OperationStatus` shape on 200.
export type _CloneResponseContract = Expect<
  Equal<InferResponseType<ClonePost, 200>, OperationStatus>
>;
export type _AbortResponseContract = Expect<
  Equal<InferResponseType<AbortPost, 200>, OperationStatus>
>;
export type _StatusResponseContract = Expect<
  Equal<InferResponseType<StatusGet, 200>, OperationStatus>
>;
export type _ClonedResponseContract = Expect<
  Equal<InferResponseType<ClonedGet, 200>, { repos: RepoTarget[] }>
>;
export type _GithubResponseContract = Expect<
  Equal<InferResponseType<GithubGet, 200>, RepoListResponse>
>;
