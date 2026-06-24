import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AppConfig,
  RuntimeContext,
  RuntimeLogger,
  RuntimeTelemetry,
  ServerHandle,
} from '@switchboard/shared';
import { start } from '@switchboard/server';
import { bootstrap } from './bootstrap.js';
import { superviseServer } from './supervisor.js';
import { createRuntimeRunner } from './runtime-runner.js';
import { DEFAULT_SERVE_PORT, runDockerBringUp } from './docker.js';

/**
 * `switchboard` CLI — the runtime's control plane (`runtime-cli-docker` Decision 1).
 *
 * `--version` plus a `start` that bootstraps config (Decision 4), builds a `RuntimeContext`, and
 * runs the server's imported `start(ctx)` under SUPERVISION (Decision 5: graceful
 * SIGINT/SIGTERM shutdown + bounded restart-on-crash). `start --docker` (Decision 6) is the
 * in-container supervisor: it additionally brings up `tailscaled` (userspace) + `tailscale serve`
 * in front of the dedicated serve ingress. It imports the server's `start(ctx)` — it does not
 * reimplement the server.
 */

/** Injected at build time by tsup (`define`), sourced from this package's `package.json`. */
declare const __CLI_VERSION__: string;

const USAGE = `switchboard — control plane for the Switchboard runtime

Usage:
  switchboard start            Boot the loopback server for a local run (supervised)
  switchboard start --docker   In-container supervisor: tailscaled + tailscale serve + server
  switchboard --version        Print the CLI version
  switchboard --help           Show this help

A local 'start' is bearer-only. '--docker' brings up userspace Tailscale and exposes the server
via 'tailscale serve' over a dedicated, non-host-published loopback serve port; see
docs/user/running-switchboard.md for the Docker run (volumes, mounted secrets, credentials).
`;

/** Logs go to stderr so stdout stays reserved for the one machine-readable line (the URL). */
const logger: RuntimeLogger = {
  debug: (message, attrs) => writeLog('debug', message, attrs),
  info: (message, attrs) => writeLog('info', message, attrs),
  warn: (message, attrs) => writeLog('warn', message, attrs),
  error: (message, attrs) => writeLog('error', message, attrs),
};

function writeLog(level: string, message: string, attrs?: Record<string, unknown>): void {
  const suffix = attrs ? ` ${JSON.stringify(attrs)}` : '';
  process.stderr.write(`[${level}] ${message}${suffix}\n`);
}

/** No-op telemetry seam — `start(ctx)` builds its own tracer from config (design Decision 5). */
const telemetry: RuntimeTelemetry = {
  startSpan: () => ({ end: () => undefined }),
};

/**
 * Run the local server under supervision: bootstrap config (`runtime-cli-docker` Decision 4), build
 * the context, then supervise `start(ctx)` (Decision 5). A host `start` (no `--docker`) does NOT
 * assert container isolation, so any serve ingress it binds is bearer-only and a
 * `trustServeIdentity` + serve-ingress pairing is rejected at bootstrap before any listener binds.
 * Returns the process exit code (0 on a clean signal-driven shutdown; non-zero if the supervisor
 * gives up after repeated crashes).
 */
async function runStart(): Promise<number> {
  const { config, assertNoHostPublication } = bootstrap();
  const ctx: RuntimeContext = {
    workspaceRoot: process.cwd(),
    config,
    logger,
    telemetry,
    identity: { login: null, source: 'none' },
    assertNoHostPublication,
  };

  return superviseServer({
    start: () => start(ctx),
    shutdownSignal: installShutdownSignal(),
    logger,
    onListening: announceListening,
  });
}

/**
 * `start --docker` (`runtime-cli-docker` Decision 6): the in-container supervisor. Bootstraps with
 * the container-isolation assertion (no host publication — the precondition for serve-identity
 * eligibility), ensures the dedicated serve ingress is configured, and brings up `tailscaled` +
 * `tailscale serve` in front of `start(ctx)` via the real orchestration runner. The auth key is
 * supplied to `tailscale up` BY FILE REFERENCE (the mounted secret path), so its value never enters
 * argv or logs — never baked into the image.
 */
async function runDocker(): Promise<number> {
  const { config, configDir, assertNoHostPublication } = bootstrap({
    assertNoHostPublication: true,
  });
  const servePort = config.listen.serve?.port ?? DEFAULT_SERVE_PORT;
  // The server must bind the dedicated serve ingress `tailscale serve` proxies to; keep the direct
  // ingress too for in-container probing (Decision 6 step 3).
  const dockerConfig: AppConfig = {
    ...config,
    listen: { direct: config.listen.direct ?? { port: 0 }, serve: { port: servePort } },
  };
  const ctx: RuntimeContext = {
    workspaceRoot: process.cwd(),
    config: dockerConfig,
    logger,
    telemetry,
    identity: { login: null, source: 'none' },
    assertNoHostPublication,
  };

  return runDockerBringUp({
    runner: createRuntimeRunner(),
    start: () => start(ctx),
    shutdownSignal: installShutdownSignal(),
    logger,
    servePort,
    authKeyFile: resolveAuthKeyFile(configDir),
    onListening: announceListening,
  });
}

/**
 * Resolve the PATH to the mounted Tailscale auth-key secret. `--docker` passes this to
 * `tailscale up` via the `--auth-key=file:<path>` form, so the key VALUE never enters argv or logs.
 * Precedence:
 *   1. `TS_AUTHKEY_FILE` — an explicit mounted-secret path (the conventional `*_FILE` form);
 *   2. the default `secrets/tailscale-authkey` under the config dir, when present;
 *   3. a raw `TS_AUTHKEY` / `TAILSCALE_AUTHKEY` value materialised to that default file at mode
 *      `600` — so an env-supplied key is still handed to `tailscale up` by file reference, never
 *      inlined into argv.
 */
function resolveAuthKeyFile(configDir: string): string {
  const explicit = process.env.TS_AUTHKEY_FILE;
  if (explicit && explicit.trim().length > 0) return explicit.trim();

  const defaultPath = join(configDir, 'secrets', 'tailscale-authkey');
  if (existsSync(defaultPath)) return defaultPath;

  const fromEnv = process.env.TS_AUTHKEY ?? process.env.TAILSCALE_AUTHKEY;
  if (fromEnv && fromEnv.trim().length > 0) {
    writeFileSync(defaultPath, `${fromEnv.trim()}\n`, { mode: 0o600 });
    chmodSync(defaultPath, 0o600); // enforce 600 even if a permissive umask widened the create mode
    return defaultPath;
  }

  throw new Error(
    'no Tailscale auth key found: set TS_AUTHKEY_FILE to the mounted secret path, place the key in ' +
      'secrets/tailscale-authkey under the config dir, or set TS_AUTHKEY (a mounted-secret value)',
  );
}

/**
 * stdout carries the machine-readable facts callers parse: the bound loopback URL of each ingress,
 * tagged so a consumer (e.g. the packaged-CLI smoke test) can address the direct vs serve port.
 */
function announceListening(handle: ServerHandle): void {
  if (handle.urls.direct) {
    process.stdout.write(`Switchboard listening (direct) on ${handle.urls.direct}\n`);
  }
  if (handle.urls.serve) {
    process.stdout.write(`Switchboard listening (serve) on ${handle.urls.serve}\n`);
  }
}

/**
 * Wire SIGINT/SIGTERM to an `AbortController` the supervisor watches: an aborted signal requests a
 * graceful close (no restart) (`runtime-cli-docker` Decision 5). The supervisor performs the close.
 */
function installShutdownSignal(): AbortSignal {
  const controller = new AbortController();
  const onSignal = (signal: NodeJS.Signals): void => {
    logger.info(`received ${signal}, shutting down`);
    controller.abort();
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));
  return controller.signal;
}

/** Dispatch a single command. Returns the desired process exit code. */
async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === '--version' || command === '-v') {
    process.stdout.write(`${__CLI_VERSION__}\n`);
    return 0;
  }

  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === 'start') {
    const docker = rest.includes('--docker');
    const unknown = rest.filter((arg) => arg !== '--docker');
    if (unknown.length > 0) {
      process.stderr.write(`switchboard: unexpected arguments for 'start': ${unknown.join(' ')}\n`);
      return 1;
    }
    return docker ? runDocker() : runStart();
  }

  process.stderr.write(`switchboard: unknown command '${command}'\n\n${USAGE}`);
  return 1;
}

main(process.argv.slice(2))
  .then((code) => {
    if (code !== 0) process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`switchboard: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
