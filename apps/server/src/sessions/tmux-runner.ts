import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { isValidTmuxSessionName } from '@switchboard/shared';

/**
 * The tmux subprocess seam (design Decision 3), mirroring `repos/git-runner.ts`. Claude sessions
 * run DETACHED inside a `tmux` session rooted at a worktree; this seam is how the session slice
 * talks to the host's `tmux`. Production spawns `tmux` via `child_process` (the system runner,
 * below); tests inject the controllable fake (`apps/server/src/testing/tmux-runner.ts`). The
 * minimal surface is launch + the three liveness/teardown reads the slice needs.
 *
 * Every method takes / returns an opaque, already-derived tmux session NAME — the seam never
 * decodes a name back into a branch or worktree identity (forward-derivation only, Decision 1).
 */
export interface TmuxRunner {
  /**
   * Launch a DETACHED tmux session `name` rooted at `cwd` running `command` as argv (no shell):
   * `tmux new-session -d -s <name> -c <cwd> -- <command...>`. The argv form is what keeps an
   * adversarial branch-derived path/name out of a shell line (spec: the launch is argv, not a
   * shell line).
   */
  newSession(name: string, cwd: string, command: string[]): Promise<void>;
  /** True when a live tmux session named `name` exists (`tmux has-session`). */
  hasSession(name: string): Promise<boolean>;
  /** The live `sb-`-prefixed Switchboard session names (`tmux list-sessions`). */
  listSessions(): Promise<string[]>;
  /** Kill the tmux session `name`; idempotent — a no-op when the session is already absent. */
  killSession(name: string): Promise<void>;
}

/**
 * A launch failure carries only a typed marker — never tmux's stderr text (no-leak). The `kind`
 * (`tmux-failure`) is what the operation ledger records on the failed launch record, so the session
 * orchestrator surfaces a SESSION failure kind rather than the clone `git-failure` default.
 */
export class TmuxLaunchError extends Error {
  readonly kind = 'tmux-failure' as const;
  constructor(readonly code: number | null) {
    super('tmux launch failed');
    this.name = 'TmuxLaunchError';
  }
}

/** Minimal spawn surface the runner needs — injectable so tests assert argv without a real tmux. */
interface SpawnedProcess {
  stdout: { on(event: 'data', cb: (chunk: Buffer) => void): void } | null;
  stderr: { on(event: 'data', cb: (chunk: Buffer) => void): void } | null;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'close', cb: (code: number | null) => void): void;
}
export type SpawnFn = (command: string, args: string[], options?: SpawnOptions) => SpawnedProcess;

/** Production spawn: stdout piped (for `list-sessions`), stderr discarded at the OS level (no-leak). */
const defaultSpawn: SpawnFn = (command, args) =>
  nodeSpawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] }) as unknown as SpawnedProcess;

/**
 * The system `TmuxRunner` (design Decision 3). Spawns `tmux` as argv (never a shell line, so an
 * adversarial branch-derived path/name is never interpolated into a shell), captures only the
 * `code`/`stdout` it needs, and discards stderr unread — a tmux/`claude` error body never reaches a
 * log (no-leak), mirroring the git-runner.
 */
export function createTmuxRunner(spawn: SpawnFn = defaultSpawn): TmuxRunner {
  // Run `tmux <args>` capturing stdout; resolves with the exit code (never throwing on non-zero —
  // the caller decides what a non-zero exit means). stderr is discarded unread.
  const run = (args: string[]): Promise<{ code: number | null; stdout: string }> => {
    const child = spawn('tmux', args);
    let stdout = '';
    child.stdout?.on('data', (chunk) => {
      if (stdout.length < 1_000_000) stdout += chunk.toString('utf8');
    });
    // Drain stderr without retaining it (defence in depth when a fake pipes it).
    child.stderr?.on('data', () => {});
    return new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout }));
    });
  };

  return {
    async newSession(name, cwd, command) {
      const { code } = await run(['new-session', '-d', '-s', name, '-c', cwd, '--', ...command]);
      if (code !== 0) throw new TmuxLaunchError(code);
    },
    async hasSession(name) {
      return (await run(['has-session', '-t', name])).code === 0;
    },
    async listSessions() {
      const { code, stdout } = await run(['list-sessions', '-F', '#{session_name}']);
      if (code !== 0) return []; // no tmux server / no sessions → nothing live
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => isValidTmuxSessionName(line));
    },
    async killSession(name) {
      // Idempotent: killing an absent session exits non-zero — treated as a successful no-op.
      await run(['kill-session', '-t', name]);
    },
  };
}
