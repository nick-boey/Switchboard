import type {
  RuntimeContext,
  RuntimeLogger,
  RuntimeTelemetry,
  ServerHandle,
} from '@switchboard/shared';
import { start } from '@switchboard/server';
import { bootstrap } from './bootstrap.js';
import { superviseServer } from './supervisor.js';

/**
 * `switchboard` CLI — the runtime's control plane (`runtime-cli-docker` Decision 1).
 *
 * `--version` plus a `start` that bootstraps config (Decision 4), builds a `RuntimeContext`, and
 * runs the server's imported `start(ctx)` under SUPERVISION (Decision 5: graceful
 * SIGINT/SIGTERM shutdown + bounded restart-on-crash). It imports the server's `start(ctx)` — it
 * does not reimplement the server.
 */

/** Injected at build time by tsup (`define`), sourced from this package's `package.json`. */
declare const __CLI_VERSION__: string;

const USAGE = `switchboard — local control plane for the Switchboard runtime

Usage:
  switchboard start        Boot the loopback server for a local run
  switchboard --version    Print the CLI version
  switchboard --help       Show this help

This is the local thin shell (design Decision 8). Docker/Tailscale orchestration
is provided by a later change (runtime-cli-docker).
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
    if (rest.length > 0) {
      process.stderr.write(`switchboard: unexpected arguments for 'start': ${rest.join(' ')}\n`);
      return 1;
    }
    return runStart();
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
