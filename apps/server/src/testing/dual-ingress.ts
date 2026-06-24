import { networkInterfaces } from 'node:os';
import { configSchema, type AppConfig, type ServerHandle } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import { start } from '../server.js';

/**
 * Dual-ingress test helper (`runtime-cli-docker` task 1.1).
 *
 * Boots `start(ctx)` with a listen spec carrying BOTH a direct loopback-TCP ingress and a
 * dedicated serve ingress (two loopback-TCP listeners on ephemeral ports), and exposes each
 * resolved loopback URL so a test can issue requests to — and observe which ingress admitted —
 * each port deterministically, without Docker or real Tailscale. `close()` releases both
 * listeners.
 *
 * `assertNoHostPublication` sets the runtime's container-isolation assertion (Decision 3): with it
 * `true` and `trustServeIdentity` enabled, the serve ingress is bound identity-eligible; otherwise
 * the serve ingress is bearer-only (the host-reachable case).
 */
export interface DualIngressFixture {
  /** Resolved loopback URL of the direct/local loopback-TCP ingress (bearer-only). */
  directUrl: string;
  /** Resolved loopback URL of the dedicated serve ingress. */
  serveUrl: string;
  /** The underlying handle (for `urls`, `whenClosed`, etc.). */
  handle: ServerHandle;
  /** Release both listeners' ports. */
  close(): Promise<void>;
}

export interface DualIngressOptions {
  /** Extra config fields merged before parsing (e.g. `trustServeIdentity`, `identityAllowlist`). */
  config?: Record<string, unknown>;
  /** The runtime no-host-publication assertion (container isolation) — defaults to `false`. */
  assertNoHostPublication?: boolean;
}

/** A non-loopback IPv4 address of this host, if any — used to prove the bind refuses it. */
export function firstNonLoopbackIPv4(): string | undefined {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return undefined;
}

export async function startDualIngress(
  options: DualIngressOptions = {},
): Promise<DualIngressFixture> {
  const config: AppConfig = configSchema.parse({
    bearerToken: 'test-bearer-token',
    // Two ephemeral loopback-TCP listeners: the direct ingress and the dedicated serve ingress.
    listen: { direct: { port: 0 }, serve: { port: 0 } },
    ...options.config,
  });
  const ctx = makeTestContext({ config, assertNoHostPublication: options.assertNoHostPublication });
  const handle = await start(ctx);

  const directUrl = handle.urls.direct;
  const serveUrl = handle.urls.serve;
  if (!directUrl || !serveUrl) {
    await handle.close();
    throw new Error(
      `dual-ingress helper expected both ingresses bound; got ${JSON.stringify(handle.urls)}`,
    );
  }

  return { directUrl, serveUrl, handle, close: () => handle.close() };
}
