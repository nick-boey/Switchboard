import { describe, expect, it } from 'vitest';
import type { RuntimeLogger } from '@switchboard/shared';
import { superviseServer } from './supervisor';
import { fakeServerStarter } from './testing/server-starter';

const silentLogger: RuntimeLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** Yield to the event loop until `predicate` holds (or a bounded number of turns elapse). */
async function waitFor(predicate: () => boolean, turns = 200): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('waitFor: predicate never became true');
}

/**
 * Supervised server lifecycle (`runtime-cli-docker` Decision 5 / group 6), driven by the 1.2 seam
 * with an injected no-op `sleep` and an `AbortController` standing in for SIGINT/SIGTERM — so the
 * restart-on-crash policy (bounded backoff, give-up ceiling, no-restart-on-signal) is deterministic
 * without real timers, signals, or ports.
 */
describe('superviseServer', () => {
  it('signal-driven shutdown closes the handle gracefully and does NOT restart', async () => {
    const fake = fakeServerStarter(); // default: stay-up
    const ac = new AbortController();
    const exit = superviseServer({
      start: fake.start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      sleep: async () => {},
    });

    await waitFor(() => fake.handles.length === 1);
    ac.abort();
    expect(await exit).toBe(0);

    expect(fake.startCalls).toBe(1); // no restart on a clean signal
    expect(fake.handles[0].closeCalls).toBe(1); // graceful close released the ingresses
  });

  it('an unexpected crash is restarted after a bounded backoff', async () => {
    const fake = fakeServerStarter([{ kind: 'crash' }]); // crash once, then stay-up
    const ac = new AbortController();
    const sleeps: number[] = [];
    const exit = superviseServer({
      start: fake.start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      policy: { baseDelayMs: 500 },
    });

    await waitFor(() => fake.startCalls === 2); // restarted after the crash
    expect(sleeps[0]).toBe(500); // bounded backoff applied before the restart

    ac.abort();
    expect(await exit).toBe(0);
    expect(fake.startCalls).toBe(2);
  });

  it('a rejected start() also counts as an unexpected failure and is restarted', async () => {
    const fake = fakeServerStarter([{ kind: 'reject' }]); // start fails once, then stay-up
    const ac = new AbortController();
    const exit = superviseServer({
      start: fake.start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      sleep: async () => {},
    });

    await waitFor(() => fake.handles.length === 1); // a healthy handle on the retry
    ac.abort();
    expect(await exit).toBe(0);
    expect(fake.startCalls).toBe(2); // one failed start + one successful restart
  });

  it('repeated rapid failures past the give-up ceiling stop restarting and exit non-zero', async () => {
    const fake = fakeServerStarter(Array.from({ length: 10 }, () => ({ kind: 'crash' as const })));
    const ac = new AbortController();
    const code = await superviseServer({
      start: fake.start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      sleep: async () => {},
      policy: { giveUpAfter: 3, baseDelayMs: 1, maxDelayMs: 4, stableAfterMs: 10_000 },
    });

    expect(code).not.toBe(0);
    // giveUpAfter=3 tolerates 3 consecutive failures; the 4th gives up → exactly 4 start attempts.
    expect(fake.startCalls).toBe(4);
  });
});
