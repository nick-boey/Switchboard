import type { RuntimeLogger, ServerHandle } from '@switchboard/shared';
import type { RuntimeRunner } from './runtime-runner.js';
import { superviseServer, type ServerStarter, type SupervisorPolicy } from './supervisor.js';

/**
 * `--docker` mode: the CLI as the container entrypoint/supervisor (`runtime-cli-docker` Decision 6).
 *
 * Brings up the container runtime IN ORDER through the injectable `RuntimeRunner` (so the wiring is
 * testable without a real Tailscale daemon or Docker):
 *
 * 1. assert the installed Tailscale is at least the pinned floor (refuse fast otherwise);
 * 2. `tailscaled` with **userspace networking** (no `NET_ADMIN` / `/dev/net/tun`) — a real child;
 * 3. `tailscale up` from the **mounted auth-key secret** with a stable hostname;
 * 4. start the server on the **dedicated serve ingress** under the (reused) supervisor;
 * 5. once it is listening, expose it with the **pinned** `tailscale serve --bg --https=443
 *    http://127.0.0.1:<servePort>`.
 *
 * Both `tailscaled` (a child) and the server (via `superviseServer`) are supervised for the
 * container's lifetime; a shutdown signal closes the server and is **forwarded to `tailscaled`**.
 * No API port is published to the host — container network isolation is what makes the serve
 * ingress serve-exclusive (the bind-time identity-trust property), so the caller passes a context
 * asserting no host publication.
 */

/** The pinned minimum Tailscale version: the release that introduced `--bg` + the positional target. */
export const MIN_TAILSCALE_VERSION = '1.50.0';

/** A stable default tailnet hostname for the container. */
export const DEFAULT_TAILSCALE_HOSTNAME = 'switchboard';

/** Default dedicated serve-ingress loopback port when the config does not pin one (`--docker`). */
export const DEFAULT_SERVE_PORT = 4180;

export interface DockerBringUpOptions {
  /** The orchestration runner (real in production; the fake in tests). */
  runner: RuntimeRunner;
  /** The injected server-starter (`() => start(ctx)` with the serve ingress + isolation assertion). */
  start: ServerStarter;
  /** Aborting requests a graceful shutdown: close the server, forward the signal to `tailscaled`. */
  shutdownSignal: AbortSignal;
  logger: RuntimeLogger;
  /** The dedicated loopback-TCP serve port `tailscale serve` proxies to (a fixed, known port). */
  servePort: number;
  /** The Tailscale auth key from a mounted secret (never baked into the image, never logged). */
  authKey: string;
  /** Stable tailnet hostname; defaults to `switchboard`. */
  hostname?: string;
  /** Forwarded to the supervisor (tests inject a no-op). */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Forwarded to the supervisor. */
  policy?: Partial<SupervisorPolicy>;
  /** Called once the server is listening (e.g. to announce URLs). */
  onListening?: (handle: ServerHandle) => void;
}

/** Parse a `tailscale version` stdout and decide whether it meets `min` (semver-ish compare). */
export function tailscaleVersionAtLeast(versionStdout: string, min: string): boolean {
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(versionStdout);
  if (!found) return false;
  const actual = [Number(found[1]), Number(found[2]), Number(found[3])];
  const wanted = min.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] > wanted[i]) return true;
    if (actual[i] < wanted[i]) return false;
  }
  return true; // equal
}

export async function runDockerBringUp(options: DockerBringUpOptions): Promise<number> {
  const { runner, start, shutdownSignal, logger, servePort, authKey } = options;
  const hostname = options.hostname ?? DEFAULT_TAILSCALE_HOSTNAME;

  // 1. Version gate — refuse fast (before bringing anything up) when below the pinned floor.
  const version = await runner.run('tailscale', ['version']);
  if (!tailscaleVersionAtLeast(version.stdout, MIN_TAILSCALE_VERSION)) {
    logger.error('Tailscale is below the pinned minimum version; refusing to bring up serve', {
      minimum: MIN_TAILSCALE_VERSION,
    });
    return 1;
  }

  // 2. tailscaled (userspace networking) — a real child, supervised for the container lifetime.
  const tailscaled = runner.spawn('tailscaled', [
    '--tun=userspace-networking',
    '--state=/var/lib/tailscale/tailscaled.state',
    '--socket=/var/run/tailscale/tailscaled.sock',
  ]);
  // Forward a shutdown signal to tailscaled (Decision 5/6).
  const forward = (): void => tailscaled.kill('SIGTERM');
  if (shutdownSignal.aborted) forward();
  else shutdownSignal.addEventListener('abort', forward, { once: true });

  // 3. tailscale up from the mounted auth-key secret (argv only — the runner never logs it).
  const up = await runner.run('tailscale', [
    'up',
    `--auth-key=${authKey}`,
    `--hostname=${hostname}`,
  ]);
  if (up.code !== 0) {
    logger.error('tailscale up failed', { code: up.code });
    forward();
    await tailscaled.exited;
    return 1;
  }

  // 4. Supervise the server on the dedicated serve ingress; 5. on first listen, run pinned serve.
  let served = false;
  const code = await superviseServer({
    start,
    shutdownSignal,
    logger,
    sleep: options.sleep,
    policy: options.policy,
    onListening: async (handle) => {
      options.onListening?.(handle);
      if (served) return; // serve is configured once; the fixed serve port is stable across restarts
      served = true;
      await runner.run('tailscale', [
        'serve',
        '--bg',
        '--https=443',
        `http://127.0.0.1:${servePort}`,
      ]);
    },
  });

  // Shutdown reached the supervisor — ensure tailscaled is signalled and reaped before exiting.
  forward();
  await tailscaled.exited;
  return code;
}
