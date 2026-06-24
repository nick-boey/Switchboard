import type { RuntimeLogger, ServerHandle } from '@switchboard/shared';

/**
 * Supervised server lifecycle (`runtime-cli-docker` Decision 5).
 *
 * The CLI supervises the server it starts via the injected `start` (in production
 * `() => start(ctx)`; tests inject the 1.2 fake so no real server/ports are needed):
 *
 * - **Graceful shutdown** — when `shutdownSignal` aborts (production wires SIGINT/SIGTERM to it),
 *   the live handle is closed (releasing every ingress listener) and the supervisor returns `0`
 *   WITHOUT restarting. A clean signal never triggers a restart.
 * - **Restart-on-crash** — if `start()` rejects or the handle's `whenClosed` settles unexpectedly
 *   (not via a signal), the server is restarted with **bounded exponential backoff**. After more
 *   than `giveUpAfter` consecutive failures the supervisor stops and returns a **non-zero** code so
 *   the container/orchestrator surfaces the fault rather than crash-looping silently. A run that
 *   stays up at least `stableAfterMs` resets the consecutive-failure count.
 *
 * Returns the desired process exit code.
 */
export type ServerStarter = () => Promise<ServerHandle>;

export interface SupervisorPolicy {
  /** Backoff before the first restart (ms); doubles each consecutive failure. */
  baseDelayMs: number;
  /** Exponential-backoff ceiling (ms). */
  maxDelayMs: number;
  /** Consecutive unexpected failures tolerated; exceeding it gives up non-zero. */
  giveUpAfter: number;
  /** A run lasting at least this long is "stable" and resets the consecutive-failure count. */
  stableAfterMs: number;
}

export const DEFAULT_SUPERVISOR_POLICY: SupervisorPolicy = {
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  giveUpAfter: 5,
  stableAfterMs: 60_000,
};

export interface SuperviseOptions {
  /** The injected server-starter the supervisor calls each (re)start. */
  start: ServerStarter;
  /** Aborting this requests a graceful shutdown (no restart). Production wires SIGINT/SIGTERM. */
  shutdownSignal: AbortSignal;
  logger: RuntimeLogger;
  /** Override any backoff/give-up constant (shape is the contract; constants are not). */
  policy?: Partial<SupervisorPolicy>;
  /** Injectable backoff sleep (resolves early on abort); default uses a real timer. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Injectable clock for the stability window; default `Date.now`. */
  now?: () => number;
  /** Called with each handle once a (re)start succeeds — e.g. to announce the bound URLs. */
  onListening?: (handle: ServerHandle) => void;
}

/** Default backoff sleep: a real timer that resolves immediately when the shutdown signal aborts. */
function timerSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = (): void => done();
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Race a graceful shutdown (signal abort) against an unexpected stop (`whenClosed` settling). */
function awaitShutdownOrCrash(
  handle: ServerHandle,
  signal: AbortSignal,
): Promise<'shutdown' | 'crash'> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve('shutdown');
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      resolve('shutdown');
    };
    signal.addEventListener('abort', onAbort, { once: true });
    // `whenClosed` settling EITHER way is an unexpected stop (a graceful `close()` never settles
    // it). Catching both rejection and resolution also prevents an unhandled rejection if the
    // signal wins the race first.
    handle.whenClosed?.then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve('crash');
      },
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve('crash');
      },
    );
  });
}

export async function superviseServer(options: SuperviseOptions): Promise<number> {
  const policy = { ...DEFAULT_SUPERVISOR_POLICY, ...options.policy };
  const sleep = options.sleep ?? timerSleep;
  const now = options.now ?? Date.now;
  const { start, shutdownSignal, logger, onListening } = options;

  let consecutiveFailures = 0;

  while (!shutdownSignal.aborted) {
    const startedAt = now();
    let handle: ServerHandle;
    try {
      handle = await start();
    } catch (err) {
      consecutiveFailures += 1;
      logger.error('server failed to start', { error: String(err), attempt: consecutiveFailures });
      if (consecutiveFailures > policy.giveUpAfter) {
        logger.error('giving up after repeated start failures', { attempts: consecutiveFailures });
        return 1;
      }
      await backoff(consecutiveFailures);
      continue;
    }

    onListening?.(handle);
    const outcome = await awaitShutdownOrCrash(handle, shutdownSignal);
    if (outcome === 'shutdown') {
      logger.info('shutdown signal received, closing server');
      await handle.close();
      return 0;
    }

    // Unexpected stop. A run that stayed up long enough was healthy — reset the streak first.
    if (now() - startedAt >= policy.stableAfterMs) consecutiveFailures = 0;
    consecutiveFailures += 1;
    logger.warn('server stopped unexpectedly, will restart', { attempt: consecutiveFailures });
    if (consecutiveFailures > policy.giveUpAfter) {
      logger.error('giving up after repeated crashes', { attempts: consecutiveFailures });
      return 1;
    }
    await backoff(consecutiveFailures);
  }

  return 0;

  /** Bounded exponential backoff, interruptible by the shutdown signal. */
  async function backoff(failures: number): Promise<void> {
    const delay = Math.min(policy.baseDelayMs * 2 ** (failures - 1), policy.maxDelayMs);
    await sleep(delay, shutdownSignal);
  }
}
