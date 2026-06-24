import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createTmuxRunner, TmuxLaunchError, type SpawnFn } from './tmux-runner.js';

/**
 * The tmux subprocess seam's system implementation (task 3.1, design Decision 3) — mirrors
 * `repos/git-runner.ts`. Against an injectable spawn we assert that launch builds
 * `tmux new-session -d -s <name> -c <cwd> -- claude --remote-control` as ARGV (no shell line), and
 * that `hasSession` / `listSessions` / `killSession` map to the right `tmux` invocations. stderr is
 * never read (discarded — no leak).
 */

/** A scripted spawn fake: each invocation resolves with the `(code, stdout)` the script returns. */
function makeSpawn(script: (args: string[]) => { code: number; stdout?: string }): {
  spawn: SpawnFn;
  calls: { command: string; args: string[]; shell: boolean }[];
} {
  const calls: { command: string; args: string[]; shell: boolean }[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, shell: Boolean(options?.shell) });
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter | null;
      stderr: EventEmitter | null;
    };
    child.stdout = new EventEmitter();
    child.stderr = null;
    const { code, stdout } = script(args);
    queueMicrotask(() => {
      if (stdout) child.stdout?.emit('data', Buffer.from(stdout, 'utf8'));
      child.emit('close', code);
    });
    return child as unknown as ReturnType<SpawnFn>;
  };
  return { spawn, calls };
}

describe('createTmuxRunner (system tmux seam)', () => {
  it('newSession launches a detached argv command — never a shell line', async () => {
    const { spawn, calls } = makeSpawn(() => ({ code: 0 }));
    const tmux = createTmuxRunner(spawn);
    await tmux.newSession('sb-feat--0123456789ab', '/wt/path', ['claude', '--remote-control']);

    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('tmux');
    expect(calls[0].args).toEqual([
      'new-session',
      '-d',
      '-s',
      'sb-feat--0123456789ab',
      '-c',
      '/wt/path',
      '--',
      'claude',
      '--remote-control',
    ]);
    // Argv, not a shell line: spawn is given an args array and `shell` is never enabled.
    expect(calls[0].shell).toBe(false);
  });

  it('newSession rejects with a typed error on a non-zero exit (no stderr surfaced)', async () => {
    const { spawn } = makeSpawn(() => ({ code: 1 }));
    const tmux = createTmuxRunner(spawn);
    await expect(
      tmux.newSession('sb-feat--0123456789ab', '/wt/path', ['claude', '--remote-control']),
    ).rejects.toBeInstanceOf(TmuxLaunchError);
  });

  it('hasSession maps to `has-session -t` and is true/false on exit 0/non-zero', async () => {
    const { spawn: spawnLive, calls: liveCalls } = makeSpawn(() => ({ code: 0 }));
    expect(await createTmuxRunner(spawnLive).hasSession('sb-x--0123456789ab')).toBe(true);
    expect(liveCalls[0].args).toEqual(['has-session', '-t', 'sb-x--0123456789ab']);

    const { spawn: spawnDead } = makeSpawn(() => ({ code: 1 }));
    expect(await createTmuxRunner(spawnDead).hasSession('sb-x--0123456789ab')).toBe(false);
  });

  it('listSessions maps to `list-sessions -F` and returns only sb- prefixed live names', async () => {
    const { spawn, calls } = makeSpawn(() => ({
      code: 0,
      stdout: 'sb-a--0123456789ab\nmy-own-session\nsb-b--abcdef012345\n',
    }));
    const tmux = createTmuxRunner(spawn);
    expect(await tmux.listSessions()).toEqual(['sb-a--0123456789ab', 'sb-b--abcdef012345']);
    expect(calls[0].args).toEqual(['list-sessions', '-F', '#{session_name}']);
  });

  it('listSessions returns [] when tmux has no server (non-zero exit)', async () => {
    const { spawn } = makeSpawn(() => ({ code: 1 }));
    expect(await createTmuxRunner(spawn).listSessions()).toEqual([]);
  });

  it('killSession maps to `kill-session -t` and resolves even when absent (idempotent)', async () => {
    const { spawn, calls } = makeSpawn(() => ({ code: 1 }));
    const tmux = createTmuxRunner(spawn);
    await expect(tmux.killSession('sb-x--0123456789ab')).resolves.toBeUndefined();
    expect(calls[0].args).toEqual(['kill-session', '-t', 'sb-x--0123456789ab']);
  });
});
