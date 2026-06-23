import { z } from 'zod';

/**
 * Shared contracts for the `repo-clone-browse` slice (design Decisions 5–8). Owned by
 * `packages/shared` so the server validates and the web client consumes one source of truth:
 *
 * - the owner/repo clone-target parser + clone request,
 * - the owner-aware repo-list response (`github-repos`),
 * - the clone / operation-status response and the abort request (`repo-clone`).
 */

// --- Repo-id / clone-target parsing (Decision 5) ----------------------------

/** Conservative safe charset for a single path segment — matches the prototype's `parseRepoUrl`. */
const SAFE_SEGMENT = /^[A-Za-z0-9_.-]+$/;
/** Segments that would escape the on-disk layout if used as a directory name. */
const TRAVERSAL_SEGMENTS = new Set(['.', '..']);

export interface RepoTarget {
  owner: string;
  repo: string;
}

/**
 * Parse a clone target into a validated `{ owner, repo }`, or `null` if it is not a safe target
 * (Decision 5). Accepts a full `https://github.com/<owner>/<repo>` URL (with an optional trailing
 * `.git`, normalized away) or a bare `<owner>/<repo>`. Rejects out-of-charset characters, embedded
 * slashes (extra path segments), and `.`/`..` traversal segments BEFORE any path is derived.
 */
export function parseRepoTarget(input: string): RepoTarget | null {
  const s = input.trim();
  if (!s) return null;
  const m = /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(s);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) return null;
  if (TRAVERSAL_SEGMENTS.has(owner) || TRAVERSAL_SEGMENTS.has(repo)) return null;
  return { owner, repo };
}

/** Build the canonical `<owner>/<repo>` repo-id from a parsed target. */
export function toRepoId(target: RepoTarget): string {
  return `${target.owner}/${target.repo}`;
}

/** True when `value` is a safe canonical `<owner>/<repo>` repo-id. */
export function isValidRepoId(value: string): boolean {
  const parsed = parseRepoTarget(value);
  return parsed !== null && toRepoId(parsed) === value;
}

// --- Clone request (Decision 6) ---------------------------------------------

/**
 * The clone request: a single `target` string validated and transformed into the parsed
 * `{ owner, repo, repoId }`. The typed client sends `{ target }`; the handler reads the parsed
 * shape off `c.req.valid('json')`. An unparseable target fails Zod (→ `422`, handler not run).
 */
export const cloneRequestSchema = z
  .object({ target: z.string().min(1) })
  .transform((value, ctx) => {
    const parsed = parseRepoTarget(value.target);
    if (!parsed) {
      ctx.addIssue({ code: 'custom', message: 'invalid repository target' });
      return z.NEVER;
    }
    return { owner: parsed.owner, repo: parsed.repo, repoId: toRepoId(parsed) };
  });

export type CloneRequest = z.input<typeof cloneRequestSchema>;
export type ParsedCloneRequest = z.output<typeof cloneRequestSchema>;

// --- Abort request (Decision 6) ---------------------------------------------

/** The abort request: a canonical `<owner>/<repo>` repo-id; malformed input fails Zod (→ `422`). */
export const abortRequestSchema = z.object({
  repoId: z.string().refine(isValidRepoId, { message: 'invalid repoId' }),
});

export type AbortRequest = z.infer<typeof abortRequestSchema>;

// --- Operation / clone status (Decisions 3 + 6) -----------------------------

/** The UI-facing clone lifecycle state (mapped from the ledger's operation state). */
export const cloneStatusSchema = z.enum(['cloning', 'ready', 'error', 'aborted']);
export type CloneStatus = z.infer<typeof cloneStatusSchema>;

/** The typed failure kinds a clone can record (Decision 2 + git failures). */
export const cloneErrorKindSchema = z.enum([
  'unauthorized',
  'not-found',
  'rate-limited',
  'git-failure',
]);
export type CloneErrorKind = z.infer<typeof cloneErrorKindSchema>;

export const cloneErrorSchema = z.object({
  kind: cloneErrorKindSchema,
  /** Rate-limit reset (ISO 8601), present only for `rate-limited`. */
  resetAt: z.string().optional(),
});
export type CloneError = z.infer<typeof cloneErrorSchema>;

/** The operation-status response shared by clone, abort, and status routes. */
export const operationStatusSchema = z.object({
  repoId: z.string(),
  operationId: z.string(),
  status: cloneStatusSchema,
  error: cloneErrorSchema.optional(),
});
export type OperationStatus = z.infer<typeof operationStatusSchema>;

// --- Repo-list response (Decisions 7 + 8) -----------------------------------

/** A selectable owner — the authenticated account (`user`) or an organisation. */
export const githubOwnerSchema = z.object({
  login: z.string(),
  kind: z.enum(['user', 'organisation']),
});
export type GithubOwner = z.infer<typeof githubOwnerSchema>;

/** A repository the PAT can access, carrying its owner so the UI can scope by owner. */
export const githubRepoSchema = z.object({
  owner: z.string(),
  name: z.string(),
});
export type GithubRepo = z.infer<typeof githubRepoSchema>;

/**
 * The owner-aware repo-list response: the `ok` variant carries the selectable owners (account +
 * organisations) and the accessible repositories; the typed non-ok states let the UI distinguish
 * "not configured" from "token invalid" from "rate limited" from "not found" without a GitHub
 * error body ever crossing the wire.
 */
export const repoListResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    owners: z.array(githubOwnerSchema),
    repositories: z.array(githubRepoSchema),
  }),
  z.object({ status: z.literal('not-configured') }),
  z.object({ status: z.literal('unauthorized') }),
  z.object({ status: z.literal('rate-limited'), resetAt: z.string() }),
  z.object({ status: z.literal('not-found') }),
]);
export type RepoListResponse = z.infer<typeof repoListResponseSchema>;
