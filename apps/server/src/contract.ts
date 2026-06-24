import type { InferRequestType, InferResponseType } from 'hono/client';
import type {
  OperationStatus,
  RepoListResponse,
  RepoTarget,
  SessionListResponse,
  WorktreeListResponse,
  WorktreeMode,
} from '@switchboard/shared';
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

// --- worktree-management routes (design Decision 8) -------------------------
// The typed client mirrors every worktree route; drift from the shared schemas fails the build.

type WtCreatePost = ServerClient['worktrees']['create']['$post'];
type WtDeletePost = ServerClient['worktrees']['delete']['$post'];
type WtListGet = ServerClient['worktrees'][':owner'][':repo']['$get'];
type WtStatusGet = ServerClient['worktrees'][':owner'][':repo'][':wtId']['status']['$get'];

// The create request is the shared schema's shape (no transform): `{ repoId, branch, mode, base? }`.
export type _WtCreateRequestContract = Expect<
  Equal<
    InferRequestType<WtCreatePost>['json'],
    { repoId: string; branch: string; mode: WorktreeMode; base?: string }
  >
>;
export type _WtDeleteRequestContract = Expect<
  Equal<InferRequestType<WtDeletePost>['json'], { repoId: string; wtId: string; force?: boolean }>
>;

// Create returns the shared operation status; delete reports a typed deleted/not-safe/not-found
// outcome (not-found = the target is not a git-managed worktree, so nothing was removed).
export type _WtCreateResponseContract = Expect<
  Equal<InferResponseType<WtCreatePost, 200>, OperationStatus>
>;
export type _WtDeleteResponseContract = Expect<
  Equal<
    InferResponseType<WtDeletePost, 200>,
    { status: 'deleted' } | { status: 'not-safe' } | { status: 'not-found' }
  >
>;
export type _WtStatusResponseContract = Expect<
  Equal<InferResponseType<WtStatusGet, 200>, OperationStatus>
>;
export type _WtListResponseContract = Expect<
  Equal<InferResponseType<WtListGet, 200>, WorktreeListResponse>
>;

// --- claude-session-launch routes (design Decision 4 / 8) -------------------
// The typed client mirrors every session route; drift from the shared schemas fails the build.

type SessLaunchPost = ServerClient['sessions']['launch']['$post'];
type SessStopPost = ServerClient['sessions']['stop']['$post'];
type SessListGet = ServerClient['sessions'][':owner'][':repo']['$get'];
type SessStatusGet = ServerClient['sessions'][':owner'][':repo'][':wtId']['status']['$get'];

// Launch + stop send the shared `{ repoId, wtId }` shape.
export type _SessLaunchRequestContract = Expect<
  Equal<InferRequestType<SessLaunchPost>['json'], { repoId: string; wtId: string }>
>;
export type _SessStopRequestContract = Expect<
  Equal<InferRequestType<SessStopPost>['json'], { repoId: string; wtId: string }>
>;

// Launch + launch-status return the shared operation status; stop reports a typed stopped outcome;
// the per-repo list returns the shared existence + mapping response.
export type _SessLaunchResponseContract = Expect<
  Equal<InferResponseType<SessLaunchPost, 200>, OperationStatus>
>;
export type _SessStopResponseContract = Expect<
  Equal<InferResponseType<SessStopPost, 200>, { status: 'stopped' }>
>;
export type _SessStatusResponseContract = Expect<
  Equal<InferResponseType<SessStatusGet, 200>, OperationStatus>
>;
export type _SessListResponseContract = Expect<
  Equal<InferResponseType<SessListGet, 200>, SessionListResponse>
>;
