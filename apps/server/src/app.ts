import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Tracer } from '@opentelemetry/api';
import {
  abortRequestSchema,
  cloneRequestSchema,
  isValidRepoId,
  toRepoId,
  type RepoListResponse,
  type RuntimeContext,
  type RuntimeIdentity,
} from '@switchboard/shared';
import { authMiddleware, corsMiddleware } from './auth.js';
import { telemetryMiddleware } from './telemetry.js';
import { createCloneOrchestrator, type CloneOrchestrator } from './repos/index.js';
import { listGitHubRepos } from './github/index.js';

/** Injected slice dependencies (tests supply fakes; `start`/`createApp` build real ones). */
export interface RepoDeps {
  orchestrator?: CloneOrchestrator;
  listGitHub?: () => Promise<RepoListResponse>;
}

/** Optional wiring for `createApp` — tests inject a tracer; `start` supplies one from config. */
export interface CreateAppOptions {
  tracer?: Tracer;
  repos?: RepoDeps;
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
    );

  return routes;
}

/** The server's route type — the typed client (Decision 4) is parameterised by this. */
export type AppType = ReturnType<typeof createApp>;
