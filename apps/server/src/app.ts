import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Tracer } from '@opentelemetry/api';
import type { RuntimeContext, RuntimeIdentity } from '@switchboard/shared';
import { authMiddleware, corsMiddleware } from './auth.js';
import { telemetryMiddleware } from './telemetry.js';

/** Optional wiring for `createApp` — tests inject a tracer; `start` supplies one from config. */
export interface CreateAppOptions {
  tracer?: Tracer;
}

/** Hono environment: the auth gate publishes the admitted identity for handlers. */
export interface AppEnv {
  Variables: {
    identity: RuntimeIdentity;
  };
}

/** Placeholder validated route schema (design Decision 4 — real routes come later). */
const echoSchema = z.object({ message: z.string().min(1) });

/**
 * Build the Hono application from a `RuntimeContext` (design Decision 2). Performs NO file
 * I/O — `loadConfig()` already produced `ctx.config`.
 *
 * - `GET /health` — unauthenticated liveness endpoint (section 4 keeps it exempt).
 * - `POST /echo` — a single placeholder route validated with Zod; invalid input is rejected
 *   with `422` BEFORE the handler runs. Real routes are added by later changes.
 *
 * The return type is intentionally inferred (not annotated) so the chained route types flow
 * into `AppType`, which the typed `hc` client mirrors (Decision 4).
 */
export function createApp(ctx: RuntimeContext, options: CreateAppOptions = {}) {
  const app = new Hono<AppEnv>();

  // OTel instrumentation (design Decision 5): one semconv span per request, recorded for
  // EVERY route including `/health`. The redacting processor scrubs secrets before export.
  if (options.tracer) {
    app.use('*', telemetryMiddleware(options.tracer));
  }

  // Strict CORS on every route (design Decision 3). Mounted first so preflights for
  // disallowed origins are denied before auth.
  app.use('*', corsMiddleware(ctx));

  // Unauthenticated liveness endpoint — registered BEFORE the auth gate so it stays exempt.
  app.get('/health', (c) => c.json({ status: 'ok' as const }, 200));

  // The auth gate guards everything mounted after it (design Decision 3).
  app.use('*', authMiddleware(ctx));

  const routes = app.post(
    '/echo',
    zValidator('json', echoSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'invalid_request', issues: result.error.issues }, 422);
      }
      return undefined;
    }),
    (c) => {
      const { message } = c.req.valid('json');
      return c.json({ message, length: message.length }, 200);
    },
  );

  return routes;
}

/** The server's route type — the typed client (Decision 4) is parameterised by this. */
export type AppType = ReturnType<typeof createApp>;
