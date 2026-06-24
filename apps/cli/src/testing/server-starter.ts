import type { ServerHandle, ServerHandleUrls } from '@switchboard/shared';

/**
 * Supervisor test seam (`runtime-cli-docker` task 1.2) — the GitRunner/TmuxRunner fake is the
 * precedent. An injectable **server-starter** (`() => Promise<ServerHandle>`, exactly what the CLI
 * supervisor calls) that produces controllable fake `ServerHandle`s so the restart-on-crash policy
 * (backoff, give-up ceiling, no-restart-on-signal) can be driven WITHOUT a real server or real
 * ports — and without importing the real `@switchboard/server` value, so cli unit tests run against
 * TS source under the root vitest `switchboard-source` condition (no build needed).
 *
 * A start can be scripted to:
 * - `stay-up` (default) — resolve a handle whose `whenClosed` pends until `close()` (the healthy
 *   run / graceful-shutdown path; a graceful `close()` never settles `whenClosed`);
 * - `crash` — resolve a handle whose `whenClosed` settles on its own (an UNEXPECTED stop the
 *   supervisor must restart); also drivable after the fact via `handle.triggerCrash()`;
 * - `reject` — reject the `start()` call itself (the server failed to come up).
 */
export type StartOutcome =
  | { kind: 'stay-up' }
  | { kind: 'crash'; error?: unknown }
  | { kind: 'reject'; error?: unknown };

export interface FakeServerHandle extends ServerHandle {
  /** How many times `close()` was called (assert the supervisor's graceful teardown). */
  readonly closeCalls: number;
  /** Force an UNEXPECTED close after the handle is handed out — settles `whenClosed`. */
  triggerCrash(error?: unknown): void;
}

export interface FakeServerStarter {
  /** The injectable starter the supervisor calls (`() => Promise<ServerHandle>`). */
  start(): Promise<ServerHandle>;
  /** Handles produced so far, in start order (drive `triggerCrash`, assert `closeCalls`). */
  readonly handles: FakeServerHandle[];
  /** How many times `start()` was invoked. */
  readonly startCalls: number;
}

function makeFakeHandle(outcome: Exclude<StartOutcome, { kind: 'reject' }>): FakeServerHandle {
  let closeCalls = 0;
  let settle!: (error?: unknown) => void;
  // `whenClosed` settles ONLY on an unexpected stop (a crash) — NOT on a graceful `close()`,
  // mirroring the real `ServerHandle` contract the supervisor races against.
  const whenClosed = new Promise<void>((resolve, reject) => {
    settle = (error?: unknown) => (error === undefined ? resolve() : reject(error));
  });
  const urls: ServerHandleUrls = { direct: 'http://127.0.0.1:0' };
  const handle: FakeServerHandle = {
    url: 'http://127.0.0.1:0',
    urls,
    whenClosed,
    close() {
      closeCalls += 1;
      return Promise.resolve();
    },
    get closeCalls() {
      return closeCalls;
    },
    triggerCrash(error?: unknown) {
      settle(error);
    },
  };
  if (outcome.kind === 'crash') settle(outcome.error);
  return handle;
}

export function fakeServerStarter(script: StartOutcome[] = []): FakeServerStarter {
  const queue = [...script];
  const handles: FakeServerHandle[] = [];
  let startCalls = 0;
  return {
    handles,
    get startCalls() {
      return startCalls;
    },
    start() {
      startCalls += 1;
      const outcome: StartOutcome = queue.shift() ?? { kind: 'stay-up' };
      if (outcome.kind === 'reject') {
        return Promise.reject(outcome.error ?? new Error('fake start() rejected'));
      }
      const handle = makeFakeHandle(outcome);
      handles.push(handle);
      return Promise.resolve(handle);
    },
  };
}
