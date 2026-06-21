import { serve, type ServerType } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import type { RuntimeContext, ServerHandle } from '@switchboard/shared';
import { createApp } from './app.js';
import { createTelemetry } from './telemetry.js';

/** Loopback-only bind (design Decision 3): `tailscale serve` is the exclusive ingress. */
const LOOPBACK_HOST = '127.0.0.1';

/**
 * Server entrypoint (design Decision 2): `start(ctx): Promise<ServerHandle>`.
 *
 * Binds to `127.0.0.1` only, mounts the app built from `ctx`, and returns a handle whose
 * `close()` stops accepting connections and releases the port. Performs no file I/O — the
 * config was already parsed by `loadConfig()` and arrives on `ctx.config`.
 */
export async function start(ctx: RuntimeContext): Promise<ServerHandle> {
  const telemetry = createTelemetry(ctx.config);
  const app = createApp(ctx, { tracer: telemetry.tracer });

  const server = await new Promise<ServerType>((resolve) => {
    const s = serve({ fetch: app.fetch, hostname: LOOPBACK_HOST, port: 0 }, () => resolve(s));
  });

  const { port } = server.address() as AddressInfo;
  const url = `http://${LOOPBACK_HOST}:${port}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          // Flush + shut down telemetry on graceful close.
          void telemetry.shutdown().finally(() => (err ? reject(err) : resolve()));
        });
      }),
  };
}
