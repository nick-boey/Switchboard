import { Hono, type Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Tracer } from '@opentelemetry/api';
import {
  abortRequestSchema,
  cloneRequestSchema,
  isValidRepoId,
  isValidWorktreeId,
  parseRepoTarget,
  sessionLaunchRequestSchema,
  sessionStopRequestSchema,
  toRepoId,
  worktreeCreateRequestSchema,
  worktreeDeleteRequestSchema,
  type RepoListResponse,
  type RuntimeContext,
  type RuntimeIdentity,
  type SessionListResponse,
} from '@switchboard/shared';
import { authMiddleware, corsMiddleware, DIRECT_INGRESS_TRUST, type IngressTrust } from './auth.js';
import { telemetryMiddleware } from './telemetry.js';
import { createCloneOrchestrator, type CloneOrchestrator } from './repos/index.js';
import { createWorktreeOrchestrator, type WorktreeOrchestrator } from './worktrees/orchestrator.js';
import { createWorktreeService } from './worktrees/git-worktree.js';
import { WorktreeError, WorktreeNotSafeError } from './worktrees/errors.js';
import { listGitHubRepos } from './github/index.js';
import { createSessionOrchestrator, type SessionOrchestrator } from './sessions/orchestrator.js';
import { createSessionProbe } from './sessions/session-probe.js';
import { createTmuxRunner, type TmuxRunner } from './sessions/tmux-runner.js';

/** Injected slice dependencies (tests supply fakes; `start`/`createApp` build real ones). */
export interface RepoDeps {
  orchestrator?: CloneOrchestrator;
  listGitHub?: () => Promise<RepoListResponse>;
}

/** Injected worktree-slice dependencies. */
export interface WorktreeDeps {
  orchestrator?: WorktreeOrchestrator;
}

/** Injected session-slice dependencies (tests inject a fake tmux boundary or a whole orchestrator). */
export interface SessionDeps {
  orchestrator?: SessionOrchestrator;
  /** The tmux seam — E2E/tests inject a fake so no real `claude` login is needed. */
  tmuxRunner?: TmuxRunner;
}

/** Optional wiring for `createApp` — tests inject a tracer; `start` supplies one from config. */
export interface CreateAppOptions {
  tracer?: Tracer;
  repos?: RepoDeps;
  worktrees?: WorktreeDeps;
  sessions?: SessionDeps;
  /**
   * The bind-time, ingress-scoped identity-trust flag (`runtime-cli-docker` Decision 3). `start`
   * builds one app per ingress and passes the matching flag — the direct ingress gets
   * `DIRECT_INGRESS_TRUST` (bearer-only); the dedicated serve ingress gets `serveIngressTrust(ctx)`.
   * Defaults to the bearer-only direct-ingress semantics, so an app built without it never trusts a
   * serve identity (the spoof-safe default).
   */
  ingress?: IngressTrust;
}

/**
 * Cycle-free slice-orchestrator construction (design Decision 4). Build `tmuxRunner` → the
 * tmux-only `sessionProbe` → ONE shared worktree service, then pass the probe to the **worktree**
 * orchestrator (replacing its `noSessionProbe` default) and the `tmuxRunner` to the **session**
 * orchestrator. The probe has no worktree back-edge, so there is no orchestrator-to-orchestrator
 * import and no cycle. The seam pieces are built only when an orchestrator is not injected.
 */
export function buildOrchestrators(
  ctx: RuntimeContext,
  options: CreateAppOptions = {},
): {
  repos: CloneOrchestrator;
  worktrees: WorktreeOrchestrator;
  sessions: SessionOrchestrator;
  listGitHub: () => Promise<RepoListResponse>;
} {
  const repos = options.repos?.orchestrator ?? createCloneOrchestrator(ctx);
  const listGitHub = options.repos?.listGitHub ?? (() => listGitHubRepos(ctx));
  let worktrees = options.worktrees?.orchestrator;
  let sessions = options.sessions?.orchestrator;
  if (!worktrees || !sessions) {
    const tmuxRunner = options.sessions?.tmuxRunner ?? createTmuxRunner();
    const sessionProbe = createSessionProbe(tmuxRunner);
    const worktreeService = createWorktreeService(ctx);
    worktrees ??= createWorktreeOrchestrator(ctx, { worktreeService, sessionProbe });
    sessions ??= createSessionOrchestrator(ctx, { worktreeService, tmuxRunner });
  }
  return { repos, worktrees, sessions, listGitHub };
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

/** Session-list param: a safe `<owner>/<repo>` repo-id. */
const sessionListParamSchema = z
  .object({ owner: z.string(), repo: z.string() })
  .refine((v) => isValidRepoId(`${v.owner}/${v.repo}`), { message: 'invalid repo-id' });

/** Launch-status param: a safe `<owner>/<repo>` repo-id + a path-safe `<wt-id>`. */
const sessionStatusParamSchema = z
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
 * `loadConfig()` already produced `ctx.config`. All protected routes live under the reserved,
 * gated `/api` namespace (serve-web-spa F2) — repo-clone-browse, worktrees, sessions, and `/echo`;
 * `/health` stays public at the root, and every non-`/api` path is left for the public SPA.
 *
 * The return type is intentionally inferred (not annotated) so the chained `/api` route types flow
 * into `AppType`, which the typed `hc` client mirrors as `client.api.*` (Decision 4).
 */
export function createApp(ctx: RuntimeContext, options: CreateAppOptions = {}) {
  const app = new Hono<AppEnv>();

  const { repos: orchestrator, worktrees, sessions, listGitHub } = buildOrchestrators(ctx, options);

  // OTel instrumentation (design Decision 5): one semconv span per request. The redacting
  // processor scrubs secrets before export.
  if (options.tracer) {
    app.use('*', telemetryMiddleware(options.tracer));
  }

  // Strict CORS on every route (design Decision 3). Mounted first so preflights for disallowed
  // origins are denied before auth.
  app.use('*', corsMiddleware(ctx));

  // Unauthenticated liveness endpoint — at the ROOT, outside the `/api` gate, so it stays exempt.
  app.get('/health', (c) => c.json({ status: 'ok' as const }, 200));

  // The reserved, gated API namespace (serve-web-spa F2): the auth gate lives INSIDE `/api`, so
  // EVERY `/api` route is protected reject-by-default and every non-`/api` path is left free for the
  // public SPA. Parameterised by the bind-time, ingress-scoped identity-trust flag
  // (`runtime-cli-docker` Decision 3).
  const api = new Hono<AppEnv>();
  api.use('*', authMiddleware(ctx, options.ingress ?? DIRECT_INGRESS_TRUST));

  const apiRoutes = api
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
          // The target is not a git-managed worktree under this repo (Finding B): never removed,
          // surfaced as a typed not-found outcome rather than a 500.
          if (err instanceof WorktreeError && err.kind === 'dest-not-managed')
            return c.json({ status: 'not-found' as const }, 200);
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
    )
    // Launch a Claude session for a worktree as a tracked op; returns the launch status (starting).
    .post(
      '/sessions/launch',
      zValidator('json', sessionLaunchRequestSchema, onInvalid),
      async (c) => {
        const { repoId, wtId } = c.req.valid('json');
        const status = await sessions.launchSession(repoId, wtId);
        return c.json(status, 200);
      },
    )
    // Stop a session (kill its tmux session); idempotent — an absent session is a no-op success.
    .post('/sessions/stop', zValidator('json', sessionStopRequestSchema, onInvalid), async (c) => {
      const { repoId, wtId } = c.req.valid('json');
      await sessions.stopSession(repoId, wtId);
      return c.json({ status: 'stopped' as const }, 200);
    })
    // List a repository's live sessions (existence + worktree mapping only).
    .get(
      '/sessions/:owner/:repo',
      zValidator('param', sessionListParamSchema, onInvalid),
      async (c) => {
        const { owner, repo } = c.req.valid('param');
        const response: SessionListResponse = {
          repoId: toRepoId({ owner, repo }),
          sessions: await sessions.listSessions({ owner, repo }),
        };
        return c.json(response, 200);
      },
    )
    // The session launch operation status (the starting/error poll target).
    .get(
      '/sessions/:owner/:repo/:wtId/status',
      zValidator('param', sessionStatusParamSchema, onInvalid),
      async (c) => {
        const { owner, repo, wtId } = c.req.valid('param');
        const repoId = toRepoId({ owner, repo });
        const status = await sessions.getLaunchStatus(repoId, wtId);
        if (status) return c.json(status, 200);
        return c.json({ error: 'not-found' as const, repoId, wtId }, 404);
      },
    );

  // Gated default WITHIN `/api`: an unknown `/api` path is rejected as API (401 unauth via the gate
  // above / 404 authed here), never falling through to the public SPA. Added as a statement so it
  // does not widen `apiRoutes`'s inferred type (keeps the typed `hc` client clean).
  apiRoutes.all('*', (c) => c.json({ error: 'not-found' as const }, 404));

  // Mount the gated API under `/api`; the returned app carries the `/api`-nested route types into
  // `AppType` (Decision 4), so the typed `hc` client mirrors `client.api.*`.
  const routes = app.route('/api', apiRoutes);

  // Public SPA (serve-web-spa web-app-serving): only when a web bundle root is configured. Static
  // assets by path + an `index.html` history fallback for non-`/api` GET/HEAD paths, registered
  // AFTER `/api` and OUTSIDE the auth gate (the bundle carries no secrets). Added as statements so
  // they do not widen `routes`'s inferred type / the typed `hc` client. With no `webRoot` the server
  // is API-only (unchanged); a configured-but-missing bundle yields `503` on SPA paths while `/api`
  // and `/health` stay unaffected.
  if (ctx.webRoot) {
    const webRoot = ctx.webRoot;
    app.use('/assets/*', serveStatic({ root: webRoot }));
    const serveIndex = async (c: Context<AppEnv>) => {
      const indexPath = join(webRoot, 'index.html');
      if (!existsSync(indexPath)) return c.json({ error: 'web-bundle-missing' as const }, 503);
      return c.html(await readFile(indexPath, 'utf8'));
    };
    app.on(['GET', 'HEAD'], '*', serveIndex);
  }

  return routes;
}

/** The server's route type — the typed client (Decision 4) is parameterised by this. */
export type AppType = ReturnType<typeof createApp>;
