import type { RuntimeProcess, RuntimeRunner, RuntimeRunResult } from '../runtime-runner.js';

/**
 * Controllable in-memory fake `RuntimeRunner` (`runtime-cli-docker` task 1.3) — the GitRunner /
 * TmuxRunner fakes are the precedent. Records every `spawn`/`run` invocation (command + argv) in a
 * single ordered `calls` array so `--docker` bring-up ORDER and the exact pinned `tailscale serve`
 * argv are observable; `run` results are controllable per-matcher (default exit 0, with a
 * configurable `tailscale version` so the >= v1.50.0 gate can be tested both ways); spawned
 * processes record forwarded signals and can be driven to exit.
 */
export interface RunnerCall {
  method: 'spawn' | 'run';
  command: string;
  args: string[];
}

export interface FakeRuntimeProcess extends RuntimeProcess {
  /** Signals forwarded to this process, in order (assert shutdown is forwarded to `tailscaled`). */
  readonly signals: NodeJS.Signals[];
  /** Drive the process to exit (settle `exited`). */
  exit(code?: number | null): void;
}

export interface FakeRuntimeRunner extends RuntimeRunner {
  /** Every spawn/run call in invocation order (command + argv). */
  readonly calls: RunnerCall[];
  /** The spawned long-running processes, in order (e.g. `tailscaled`). */
  readonly spawned: FakeRuntimeProcess[];
  /**
   * Stub a one-shot `run()` result for calls matching `match` (later stubs win). Without a stub a
   * `run()` resolves `{ code: 0, stdout: '' }`, except `tailscale version` which reports `version`.
   */
  stubRun(match: (call: RunnerCall) => boolean, result: RuntimeRunResult): void;
}

export interface FakeRuntimeRunnerOptions {
  /** What `tailscale version` reports on stdout (default `'1.50.0'` — exactly the pinned floor). */
  version?: string;
}

function makeFakeProcess(): FakeRuntimeProcess {
  const signals: NodeJS.Signals[] = [];
  let settle!: (code: number | null) => void;
  const exited = new Promise<number | null>((resolve) => {
    settle = resolve;
  });
  return {
    signals,
    exited,
    kill(signal) {
      signals.push(signal ?? 'SIGTERM');
    },
    exit(code = 0) {
      settle(code);
    },
  };
}

export function fakeRuntimeRunner(options: FakeRuntimeRunnerOptions = {}): FakeRuntimeRunner {
  const version = options.version ?? '1.50.0';
  const calls: RunnerCall[] = [];
  const spawned: FakeRuntimeProcess[] = [];
  const stubs: { match: (call: RunnerCall) => boolean; result: RuntimeRunResult }[] = [];

  return {
    calls,
    spawned,
    stubRun(match, result) {
      stubs.push({ match, result });
    },
    spawn(command, args) {
      calls.push({ method: 'spawn', command, args: [...args] });
      const proc = makeFakeProcess();
      spawned.push(proc);
      return proc;
    },
    run(command, args) {
      const call: RunnerCall = { method: 'run', command, args: [...args] };
      calls.push(call);
      // Later stubs win (a test can override the default for a specific matcher).
      for (let i = stubs.length - 1; i >= 0; i -= 1) {
        if (stubs[i].match(call)) return Promise.resolve(stubs[i].result);
      }
      if (command === 'tailscale' && args[0] === 'version') {
        return Promise.resolve({ code: 0, stdout: version });
      }
      return Promise.resolve({ code: 0, stdout: '' });
    },
  };
}
