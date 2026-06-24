import { serve, type ServerType } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import type { RuntimeContext, ServerHandle, ServerHandleUrls } from '@switchboard/shared';
import { buildOrchestrators, createApp, type CreateAppOptions } from './app.js';
import { DIRECT_INGRESS_TRUST, serveIngressTrust, type IngressTrust } from './auth.js';
import { createTelemetry } from './telemetry.js';

/** Loopback-only bind (design Decision 3): `tailscale serve` is the exclusive ingress. */
const LOOPBACK_HOST = '127.0.0.1';

/** Bind one Node server (fronting `app`) to a loopback-TCP port; resolve with the server + URL. */
async function listenLoopback(
  app: { fetch: (req: Request) => Response | Promise<Response> },
  port: number,
): Promise<{ server: ServerType; url: string }> {
  const server = await new Promise<ServerType>((resolve, reject) => {
    const s = serve({ fetch: app.fetch, hostname: LOOPBACK_HOST, port }, () => resolve(s));
    // A bind failure (e.g. EADDRINUSE) emits `error` instead of the listening callback — reject so
    // the caller can clean up any already-opened listeners rather than hanging on a half-bind.
    s.on('error', reject);
  });
  const { port: boundPort } = server.address() as AddressInfo;
  return { server, url: `http://${LOOPBACK_HOST}:${boundPort}` };
}

/**
 * Server entrypoint (foundations Decision 2): `start(ctx): Promise<ServerHandle>`.
 *
 * Binds to `127.0.0.1` only and mounts the app built from `ctx`. Per `runtime-cli-docker`
 * Decision 2 the listen spec (`ctx.config.listen`) MAY describe two ingresses — the direct/local
 * loopback-TCP ingress (bearer-only) and an OPTIONAL dedicated loopback-TCP serve ingress (the
 * serve-exclusive ingress `tailscale serve` proxies to) — so it builds **one Node server per
 * ingress fronting the same Hono app**, each with its own bind-time identity-trust flag
 * (Decision 3): the direct ingress is never identity-eligible; the serve ingress is eligible only
 * when `trustServeIdentity` is set AND the runtime asserts no host publication
 * (`ctx.assertNoHostPublication`). `close()` releases EVERY listener.
 *
 * Performs no file I/O — the config was already parsed by `loadConfig()` and arrives on
 * `ctx.config`. On boot it runs the operation ledger's **restart recovery** (foundations
 * Decision 3) ONCE — the orchestrators are shared across ingresses — before any request is served.
 * `options` lets tests inject the slice dependencies (a fake orchestrator / repo lister).
 */
export async function start(
  ctx: RuntimeContext,
  options: CreateAppOptions = {},
): Promise<ServerHandle> {
  const telemetry = createTelemetry(ctx.config);
  // Build the slices ONCE (cycle-free: tmux → probe → shared worktree service → both orchestrators)
  // and reconcile before serving, then hand the SAME instances to every ingress's app so they
  // share one set of orchestrators (one restart recovery, one in-memory state).
  const built = buildOrchestrators(ctx, options);
  await built.repos.reconcile();
  await built.worktrees.reconcile();
  await built.sessions.reconcile();

  // Shared app-build options for every ingress (same tracer + same orchestrator instances).
  const shared: CreateAppOptions = {
    tracer: telemetry.tracer,
    repos: { orchestrator: built.repos, listGitHub: built.listGitHub },
    worktrees: { orchestrator: built.worktrees },
    sessions: { orchestrator: built.sessions },
  };
  const buildApp = (ingress: IngressTrust): ReturnType<typeof createApp> =>
    createApp(ctx, { ...shared, ingress });

  const { direct, serve: serveIngress } = ctx.config.listen;
  const listeners: ServerType[] = [];
  const urls: ServerHandleUrls = {};

  // Bind every configured ingress, but never leak a partially-bound set: if a later listener fails
  // to bind (e.g. EADDRINUSE), close the ones already opened before rethrowing so the supervisor's
  // retry starts from a clean slate rather than a stuck, half-bound state.
  try {
    // Direct/local loopback-TCP ingress — always bearer-only (a forged identity header grants
    // nothing here, Decision 3).
    if (direct) {
      const { server, url } = await listenLoopback(buildApp(DIRECT_INGRESS_TRUST), direct.port);
      listeners.push(server);
      urls.direct = url;
    }
    // Dedicated serve ingress — identity-eligible ONLY when the runtime asserts no host publication
    // (computed at bind time via `serveIngressTrust`).
    if (serveIngress) {
      const { server, url } = await listenLoopback(
        buildApp(serveIngressTrust(ctx)),
        serveIngress.port,
      );
      listeners.push(server);
      urls.serve = url;
    }
  } catch (err) {
    await Promise.allSettled(
      listeners.map((server) => new Promise<void>((res) => server.close(() => res()))),
    );
    await telemetry.shutdown();
    throw err;
  }

  // The primary URL is the direct ingress when present, otherwise the serve ingress.
  const url = urls.direct ?? urls.serve ?? '';

  // Surface an UNEXPECTED stop (a crash, not a graceful close) so the CLI supervisor can restart
  // (Decision 5). A supervisor-initiated `close()` sets `intentionalClose` first, so the ensuing
  // `close` events do NOT settle this.
  let intentionalClose = false;
  let onUnexpectedClose: (() => void) | undefined;
  let onUnexpectedError: ((err: unknown) => void) | undefined;
  const whenClosed = new Promise<void>((resolve, reject) => {
    onUnexpectedClose = resolve;
    onUnexpectedError = reject;
  });
  for (const server of listeners) {
    server.on('error', (err) => {
      if (!intentionalClose) onUnexpectedError?.(err);
    });
    server.on('close', () => {
      if (!intentionalClose) onUnexpectedClose?.();
    });
  }

  return {
    url,
    urls,
    whenClosed,
    close: () =>
      new Promise<void>((resolve, reject) => {
        intentionalClose = true;
        // Release every listener's port, then flush + shut down telemetry once.
        Promise.all(
          listeners.map(
            (server) =>
              new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
          ),
        ).then(
          () => void telemetry.shutdown().finally(resolve),
          (err) => void telemetry.shutdown().finally(() => reject(err)),
        );
      }),
  };
}
