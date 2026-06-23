import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Tracer } from '@opentelemetry/api';
import {
  abortRequestSchema,
  cloneRequestSchema,
  isValidRepoId,
  isValidWorktreeId,
  parseRepoTarget,
  toRepoId,
  worktreeCreateRequestSchema,
  worktreeDeleteRequestSchema,
  type RepoListResponse,
  type RuntimeContext,
  type RuntimeIdentity,
} from '@switchboard/shared';
import { authMiddleware, corsMiddleware } from './auth.js';
import { telemetryMiddleware } from './telemetry.js';
import { createCloneOrchestrator, type CloneOrchestrator } from './repos/index.js';
import { createWorktreeOrchestrator, type WorktreeOrchestrator } from './worktrees/orchestrator.js';
import { WorktreeNotSafeError } from './worktrees/errors.js';
import { listGitHubRepos } from './github/index.js';

/** Injected slice dependencies (tests supply fakes; `start`/`createApp` build real ones). */
export interface RepoDeps {
  orchestrator?: CloneOrchestrator;
  listGitHub?: () => Promise<RepoListResponse>;
}

/** Injected worktree-slice dependencies. */
export interface WorktreeDeps {
  orchestrator?: WorktreeOrchestrator;
}

/** Optional wiring for `createApp` — tests inject a tracer; `start` supplies one from config. */
export interface CreateAppOptions {
  tracer?: Tracer;
  repos?: RepoDeps;
  worktrees?: WorktreeDeps;
}

/** Hono environment: the auth gate publishes the admitted identity for handlers. */
export interface AppEnv {
  Variables: {
    identity: RuntimeIdentity;
  };
}

/** Placeholder validated route schema (kept: the app-shell line-status check round-trips it). */
const echoSchema = z.object({ message: z.string().min(1) });

/** Status route param: a safe `<owner>/<repo>` repo-id. */
const statusParamSchema = z
  .object({ owner: z.string(), repo: z.string() })
  .refine((v) => isValidRepoId(`${v.owner}/${v.repo}`), { message: 'invalid repo-id' });

/** Worktree list param: a safe `<owner>/<repo>` repo-id. */
const worktreeRepoParamSchema = z
  .object({ owner: z.string(), repo: z.string() })
  .refine((v) => isValidRepoId(`${v.owner}/${v.repo}`), { message: 'invalid repo-id' });

/** Worktree status param: a safe `<owner>/<repo>` repo-id + a path-safe `<wt-id>`. */
const worktreeStatusParamSchema = z
  .object({ owner: z.string(), repo: z.string(), wtId: z.string() })
  .refine((v) => isValidRepoId(`${v.owner}/${v.repo}`) && isValidWorktreeId(v.wtId), {
    message: 'invalid worktree id',
  });

/** Shared Zod-validation failure handler — reject with `422` BEFORE the handler runs. */
function onInvalid(
  result: { success: boolean; error?: { issues: unknown } },
  c: { json: (body: unknown, status: 422) => Response },
): Response | undefined {
  if (!result.success) {
    return c.json({ error: 'invalid_request', issues: result.error?.issues }, 422);
  }
  return undefined;
}

/**
 * Build the Hono application from a `RuntimeContext` (design Decision 2). Performs NO file I/O —
 * `loadConfig()` already produced `ctx.config`. Registers the protected repo-clone-browse routes
 * (clone / abort / list-cloned / operation-status / repo-list) plus `/echo` and `/health`.
 *
 * The return type is intentionally inferred (not annotated) so the chained route types flow into
 * `AppType`, which the typed `hc` client mirrors (Decision 4).
 */
export function createApp(ctx: RuntimeContext, options: CreateAppOptions = {}) {
  const app = new Hono<AppEnv>();

  const orchestrator = options.repos?.orchestrator ?? createCloneOrchestrator(ctx);
  const worktrees = options.worktrees?.orchestrator ?? createWorktreeOrchestrator(ctx);
  const listGitHub = options.repos?.listGitHub ?? (() => listGitHubRepos(ctx));

  // OTel instrumentation (design Decision 5): one semconv span per request. The redacting
  // processor scrubs secrets before export.
  if (options.tracer) {
    app.use('*', telemetryMiddleware(options.tracer));
  }

  // Strict CORS on every route (design Decision 3). Mounted first so preflights for disallowed
  // origins are denied before auth.
  app.use('*', corsMiddleware(ctx));

  // Unauthenticated liveness endpoint — registered BEFORE the auth gate so it stays exempt.
  app.get('/health', (c) => c.json({ status: 'ok' as const }, 200));

  // The auth gate guards everything mounted after it (design Decision 3).
  app.use('*', authMiddleware(ctx));

  const routes = app
    .post('/echo', zValidator('json', echoSchema, onInvalid), (c) => {
      const { message } = c.req.valid('json');
      return c.json({ message, length: message.length }, 200);
    })
    // Start a bare clone as a tracked operation; returns immediately in a `cloning` state.
    .post('/repos/clone', zValidator('json', cloneRequestSchema, onInvalid), async (c) => {
      const { owner, repo } = c.req.valid('json');
      const status = await orchestrator.startClone({ owner, repo });
      return c.json(status, 200);
    })
    // Abort an in-flight clone; reports the operation's resulting/terminal status (404 if unknown).
    .post('/repos/abort', zValidator('json', abortRequestSchema, onInvalid), async (c) => {
      const { repoId } = c.req.valid('json');
      const aborted = await orchestrator.abortClone(repoId);
      if (aborted) return c.json(aborted, 200);
      const status = await orchestrator.getStatus(repoId);
      if (status) return c.json(status, 200);
      return c.json({ error: 'not-found' as const, repoId }, 404);
    })
    // List completed clones from disk.
    .get('/repos/cloned', async (c) => {
      const repos = await orchestrator.listCloned();
      return c.json({ repos }, 200);
    })
    // The repo-list (github-repos) response: owners + repositories, or a typed non-ok state.
    .get('/repos/github', async (c) => {
      const result = await listGitHub();
      return c.json(result, 200);
    })
    // The clone operation status for a repo (the getting-ready poll target).
    .get(
      '/repos/:owner/:repo/status',
      zValidator('param', statusParamSchema, onInvalid),
      async (c) => {
        const { owner, repo } = c.req.valid('param');
        const repoId = toRepoId({ owner, repo });
        const status = await orchestrator.getStatus(repoId);
        if (status) return c.json(status, 200);
        return c.json({ error: 'not-found' as const, repoId }, 404);
      },
    )
    // Create a worktree as a tracked operation; returns immediately in an in-progress state.
    .post(
      '/worktrees/create',
      zValidator('json', worktreeCreateRequestSchema, onInvalid),
      async (c) => {
        const { repoId, branch, mode, base } = c.req.valid('json');
        const target = parseRepoTarget(repoId)!; // validated by the schema's isValidRepoId refine
        const status = await worktrees.startCreate({ target, branch, mode, base });
        return c.json(status, 200);
      },
    )
    // Delete a worktree, gated by the server-side safe-to-delete re-check (typed not-safe refusal).
    .post(
      '/worktrees/delete',
      zValidator('json', worktreeDeleteRequestSchema, onInvalid),
      async (c) => {
        const { repoId, wtId, force } = c.req.valid('json');
        const target = parseRepoTarget(repoId)!;
        try {
          await worktrees.deleteWorktree(target, wtId, { force });
          return c.json({ status: 'deleted' as const }, 200);
        } catch (err) {
          if (err instanceof WorktreeNotSafeError)
            return c.json({ status: 'not-safe' as const }, 200);
          throw err;
        }
      },
    )
    // List a repository's worktrees (git-derived, with the git lamp's status).
    .get(
      '/worktrees/:owner/:repo',
      zValidator('param', worktreeRepoParamSchema, onInvalid),
      async (c) => {
        const { owner, repo } = c.req.valid('param');
        const worktreesList = await worktrees.listWorktrees({ owner, repo });
        return c.json({ repoId: toRepoId({ owner, repo }), worktrees: worktreesList }, 200);
      },
    )
    // The worktree-create operation status (the create-progress poll target).
    .get(
      '/worktrees/:owner/:repo/:wtId/status',
      zValidator('param', worktreeStatusParamSchema, onInvalid),
      async (c) => {
        const { owner, repo, wtId } = c.req.valid('param');
        const repoId = toRepoId({ owner, repo });
        const status = await worktrees.getStatus(repoId, wtId);
        if (status) return c.json(status, 200);
        return c.json({ error: 'not-found' as const, repoId, wtId }, 404);
      },
    );

  return routes;
}

/** The server's route type — the typed client (Decision 4) is parameterised by this. */
export type AppType = ReturnType<typeof createApp>;
