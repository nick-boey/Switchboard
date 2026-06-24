import { describe, expect, it } from 'vitest';
import type { RuntimeLogger } from '@switchboard/shared';
import type { RuntimeRunner } from './runtime-runner';
import { MIN_TAILSCALE_VERSION, runDockerBringUp, tailscaleVersionAtLeast } from './docker';
import { fakeRuntimeRunner, type FakeRuntimeRunner } from './testing/runtime-runner';
import { fakeServerStarter, type FakeServerStarter } from './testing/server-starter';

const silentLogger: RuntimeLogger = { debug() {}, info() {}, warn() {}, error() {} };

const SERVE_PORT = 4180;
/** Path to the MOUNTED auth-key secret file — the bring-up references it, never the raw key value. */
const AUTH_KEY_FILE = '/var/run/secrets/tailscale-authkey';

/** Yield to the event loop until `predicate` holds (or a bounded number of turns elapse). */
async function waitFor(predicate: () => boolean, turns = 200): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('waitFor: predicate never became true');
}

/**
 * Wrap a fake runner so every spawn/run is appended to a shared `events` timeline alongside the
 * injected server-start, letting the test assert the bring-up ORDER across both the runner calls
 * and the (non-runner) server start.
 */
function instrument(
  base: FakeRuntimeRunner,
  fakeStart: FakeServerStarter,
): {
  runner: RuntimeRunner;
  start: () => ReturnType<FakeServerStarter['start']>;
  events: string[];
} {
  const events: string[] = [];
  const runner: RuntimeRunner = {
    spawn: (command, args) => {
      events.push(`spawn ${command}`);
      return base.spawn(command, args);
    },
    run: (command, args) => {
      events.push(`run ${command} ${args.join(' ')}`);
      return base.run(command, args);
    },
  };
  const start = (): ReturnType<FakeServerStarter['start']> => {
    events.push('start-server');
    return fakeStart.start();
  };
  return { runner, start, events };
}

describe('tailscaleVersionAtLeast', () => {
  it('accepts the pinned floor and newer; rejects older', () => {
    expect(tailscaleVersionAtLeast('1.50.0', MIN_TAILSCALE_VERSION)).toBe(true);
    expect(tailscaleVersionAtLeast('1.52.1\n  tailscale commit: abc', MIN_TAILSCALE_VERSION)).toBe(
      true,
    );
    expect(tailscaleVersionAtLeast('1.48.0', MIN_TAILSCALE_VERSION)).toBe(false);
    expect(tailscaleVersionAtLeast('1.6.0', MIN_TAILSCALE_VERSION)).toBe(false);
  });
});

describe('runDockerBringUp', () => {
  it('brings up tailscaled -> tailscale up -> start(ctx) -> pinned tailscale serve, in order', async () => {
    const base = fakeRuntimeRunner({ version: '1.52.0' });
    const fakeStart = fakeServerStarter();
    const { runner, start, events } = instrument(base, fakeStart);
    const ac = new AbortController();

    const exit = runDockerBringUp({
      runner,
      start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      servePort: SERVE_PORT,
      authKeyFile: AUTH_KEY_FILE,
      hostname: 'switchboard',
      sleep: async () => {},
    });

    await waitFor(() =>
      events.includes(`run tailscale serve --bg --https=443 http://127.0.0.1:${SERVE_PORT}`),
    );

    // The four bring-up steps occur IN ORDER: tailscaled -> up -> start(ctx) -> serve. (A version
    // pre-flight precedes serve; it does not reorder the four steps.)
    const idx = (needle: string): number => events.findIndex((e) => e.startsWith(needle));
    expect(idx('spawn tailscaled')).toBeLessThan(idx('run tailscale up'));
    expect(idx('run tailscale up')).toBeLessThan(idx('start-server'));
    expect(idx('start-server')).toBeLessThan(idx('run tailscale serve'));
    expect(idx('run tailscale version')).toBeLessThan(idx('run tailscale serve')); // version gate

    // tailscaled is the only spawn and uses USERSPACE networking (no NET_ADMIN / /dev/net/tun).
    expect(base.calls.filter((c) => c.method === 'spawn')).toHaveLength(1);
    expect(base.spawned).toHaveLength(1);
    expect(base.calls.find((c) => c.method === 'spawn')).toMatchObject({ command: 'tailscaled' });
    expect(base.calls.find((c) => c.method === 'spawn')?.args).toContain(
      '--tun=userspace-networking',
    );

    // tailscale up references the MOUNTED auth-key secret FILE via the `file:` form (so the key
    // stays file-resident and never lands in process argv) — never the raw key value.
    const up = base.calls.find((c) => c.command === 'tailscale' && c.args[0] === 'up');
    expect(up?.args).toContain(`--auth-key=file:${AUTH_KEY_FILE}`);

    // The PINNED serve invocation — exactly, not a fallback chain.
    const serve = base.calls.find((c) => c.command === 'tailscale' && c.args[0] === 'serve');
    expect(serve?.args).toEqual(['serve', '--bg', '--https=443', `http://127.0.0.1:${SERVE_PORT}`]);

    // Shut down: signal is forwarded to tailscaled; the server is closed; bring-up returns 0.
    ac.abort();
    base.spawned[0].exit(0); // tailscaled exits after the forwarded signal
    expect(await exit).toBe(0);
    expect(base.spawned[0].signals.length).toBeGreaterThan(0); // forwarded to tailscaled
    expect(fakeStart.handles[0].closeCalls).toBe(1); // server supervised + closed
  });

  it('asserts the Tailscale version and REFUSES (non-zero, no serve, nothing spawned) when below v1.50.0', async () => {
    const base = fakeRuntimeRunner({ version: '1.48.0' });
    const fakeStart = fakeServerStarter();
    const { runner, start, events } = instrument(base, fakeStart);
    const ac = new AbortController();

    const code = await runDockerBringUp({
      runner,
      start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      servePort: SERVE_PORT,
      authKeyFile: AUTH_KEY_FILE,
      sleep: async () => {},
    });

    expect(code).not.toBe(0);
    expect(events.some((e) => e.startsWith('run tailscale serve'))).toBe(false);
    expect(base.spawned).toHaveLength(0); // refused before bringing anything up
    expect(fakeStart.startCalls).toBe(0); // the server was never started
  });

  it('never puts the raw auth key in argv: tailscale up references the secret FILE by path (no-leak)', async () => {
    const base = fakeRuntimeRunner({ version: '1.52.0' });
    const fakeStart = fakeServerStarter();
    const { runner, start, events } = instrument(base, fakeStart);
    const ac = new AbortController();

    const exit = runDockerBringUp({
      runner,
      start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      servePort: SERVE_PORT,
      authKeyFile: AUTH_KEY_FILE,
      sleep: async () => {},
    });

    await waitFor(() => events.some((e) => e.startsWith('run tailscale up')));

    const up = base.calls.find((c) => c.command === 'tailscale' && c.args[0] === 'up');
    // The auth key is supplied by reference to the mounted secret file (the `file:` form)...
    expect(up?.args).toContain(`--auth-key=file:${AUTH_KEY_FILE}`);
    // ...and NO `--auth-key=` argv ANYWHERE inlines a key value — every one uses the `file:` prefix.
    for (const call of base.calls) {
      for (const arg of call.args) {
        if (arg.startsWith('--auth-key=')) {
          expect(arg.startsWith('--auth-key=file:')).toBe(true);
        }
      }
    }

    ac.abort();
    base.spawned[0]?.exit(0);
    await exit;
  });

  it('FAILS FAST (no healthy runtime) when `tailscale serve` fails after the server starts', async () => {
    const base = fakeRuntimeRunner({ version: '1.52.0' });
    // serve exits non-zero — the only external HTTPS ingress was never configured.
    base.stubRun((c) => c.command === 'tailscale' && c.args[0] === 'serve', {
      code: 1,
      stdout: '',
    });
    const fakeStart = fakeServerStarter();
    const { runner, start, events } = instrument(base, fakeStart);
    const ac = new AbortController();

    const exit = runDockerBringUp({
      runner,
      start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      servePort: SERVE_PORT,
      authKeyFile: AUTH_KEY_FILE,
      sleep: async () => {},
    });

    // Once serve has been attempted, the bring-up must NOT park on a healthy server: it tears the
    // server down and the process exits non-zero (here, the promise rejects).
    await waitFor(() => events.some((e) => e.startsWith('run tailscale serve')));
    base.spawned[0]?.exit(0); // allow tailscaled to be reaped during teardown
    await expect(exit).rejects.toThrow();
    expect(fakeStart.handles[0].closeCalls).toBe(1); // server was closed, not left running
  });

  it('does not park healthy when tailscaled exits unexpectedly: closes the server and exits non-zero', async () => {
    const base = fakeRuntimeRunner({ version: '1.52.0' });
    const fakeStart = fakeServerStarter(); // server stays up (healthy)
    const { runner, start, events } = instrument(base, fakeStart);
    const ac = new AbortController();

    const exit = runDockerBringUp({
      runner,
      start,
      shutdownSignal: ac.signal,
      logger: silentLogger,
      servePort: SERVE_PORT,
      authKeyFile: AUTH_KEY_FILE,
      sleep: async () => {},
    });

    // The runtime is fully up (serve configured) and healthy...
    await waitFor(() =>
      events.includes(`run tailscale serve --bg --https=443 http://127.0.0.1:${SERVE_PORT}`),
    );
    // ...then tailscaled dies on its own (NOT via a shutdown signal) — there is now no Tailscale
    // ingress, so the supervisor must not keep reporting healthy.
    base.spawned[0].exit(1);

    const code = await exit;
    expect(code).not.toBe(0); // not parked-healthy with a dead tailscaled
    expect(fakeStart.handles[0].closeCalls).toBe(1); // the server was closed
  });
});
