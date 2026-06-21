import { loadConfig } from '@switchboard/shared/node';
import type {
  RuntimeContext,
  RuntimeLogger,
  RuntimeTelemetry,
  ServerHandle,
} from '@switchboard/shared';
import { start } from '@switchboard/server';

/**
 * `switchboard` CLI — the thin shell (design Decision 8).
 *
 * Two commands only: `--version` and a LOCAL `start` that runs `loadConfig()` (Decision 6),
 * builds a `RuntimeContext`, and calls the server's `start(ctx)` for a loopback-only run.
 * No Docker / Tailscale orchestration — that is the later `runtime-cli-docker` change.
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

/** Run the local server: parse config (Decision 6), build the context, then `start(ctx)`. */
async function runStart(): Promise<void> {
  const config = loadConfig();
  const ctx: RuntimeContext = {
    workspaceRoot: process.cwd(),
    config,
    logger,
    telemetry,
    identity: { login: null, source: 'none' },
  };

  const handle = await start(ctx);
  // stdout carries the single machine-readable fact callers parse: the bound loopback URL.
  process.stdout.write(`Switchboard listening on ${handle.url}\n`);

  await waitForShutdown(handle);
}

/** Block until SIGINT/SIGTERM, then gracefully `close()` the handle and release the port. */
function waitForShutdown(handle: ServerHandle): Promise<void> {
  return new Promise((resolve) => {
    let closing = false;
    const shutdown = (signal: NodeJS.Signals): void => {
      if (closing) return;
      closing = true;
      logger.info(`received ${signal}, shutting down`);
      void handle
        .close()
        .catch((err) => logger.error('error during shutdown', { error: String(err) }))
        .finally(() => {
          process.off('SIGINT', shutdown);
          process.off('SIGTERM', shutdown);
          resolve();
        });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
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
    await runStart();
    return 0;
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
