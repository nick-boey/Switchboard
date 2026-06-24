import { spawn as nodeSpawn } from 'node:child_process';

/**
 * The Tailscale/Docker orchestration subprocess seam (`runtime-cli-docker` Decision 6), mirroring
 * `apps/server/src/repos/git-runner.ts` / `sessions/tmux-runner.ts`. `--docker` mode's bring-up
 * (`tailscaled`, `tailscale up`, `tailscale version`, `tailscale serve`) goes through this seam so
 * the wiring — argv, ordering, the pinned `serve` invocation, the version gate, signal forwarding —
 * is asserted against a controllable fake (`apps/cli/src/testing/runtime-runner.ts`) WITHOUT a real
 * Tailscale daemon or Docker. The real bring-up is covered by the manual runtime check, not CI.
 */
export interface RuntimeProcess {
  /** Forward an OS signal to the process (the supervisor uses this to shut `tailscaled` down). */
  kill(signal?: NodeJS.Signals): void;
  /** Settles with the exit code when the process exits (so the supervisor can watch liveness). */
  readonly exited: Promise<number | null>;
}

/** Outcome of a one-shot run — the exit code and captured stdout (stderr is discarded, no-leak). */
export interface RuntimeRunResult {
  code: number | null;
  stdout: string;
}

export interface RuntimeRunner {
  /** Spawn a long-running process (e.g. `tailscaled`); returns a handle to signal/await it. */
  spawn(command: string, args: string[]): RuntimeProcess;
  /** Run a one-shot command to completion; resolve with its exit code + captured stdout. */
  run(command: string, args: string[]): Promise<RuntimeRunResult>;
}

/**
 * The system `RuntimeRunner`. Spawns as argv (never a shell line), captures only the `code`/`stdout`
 * the bring-up needs, and discards stderr unread (no-leak), mirroring the git/tmux runners. Used by
 * `--docker` mode in production; tests inject the fake.
 */
export function createRuntimeRunner(): RuntimeRunner {
  return {
    spawn(command, args) {
      const child = nodeSpawn(command, args, { stdio: ['ignore', 'ignore', 'ignore'] });
      const exited = new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve(code));
      });
      return {
        kill: (signal) => void child.kill(signal),
        exited,
      };
    },
    run(command, args) {
      const child = nodeSpawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      let stdout = '';
      child.stdout?.on('data', (chunk) => {
        if (stdout.length < 1_000_000) stdout += String(chunk);
      });
      return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout }));
      });
    },
  };
}
