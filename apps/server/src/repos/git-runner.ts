import { spawn } from 'node:child_process';

/**
 * The git subprocess seam (design Decision 4). The clone runs the real `git` CLI (the credential
 * helper is a git-CLI concept). stdio is ignored — git's stderr is never captured, so a GitHub
 * error body can never reach a log (no-leak). Cancellable via an `AbortSignal` (clone abort), and
 * reports its pid for restart recovery.
 */
export interface GitRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  /** Invoked once the subprocess has a pid (recorded for restart recovery). */
  onSpawn?(pid: number): void;
}

export interface GitRunner {
  /** Run `git <args>`; resolves on exit 0, rejects otherwise (message carries the code, no body). */
  run(args: string[], options?: GitRunOptions): Promise<void>;
}

export function createGitRunner(): GitRunner {
  return {
    run(args, options = {}) {
      return new Promise<void>((resolve, reject) => {
        const child = spawn('git', args, {
          cwd: options.cwd,
          env: options.env,
          stdio: 'ignore',
        });
        if (typeof child.pid === 'number') options.onSpawn?.(child.pid);

        const onAbort = (): void => {
          child.kill('SIGTERM');
        };
        if (options.signal) {
          if (options.signal.aborted) child.kill('SIGTERM');
          else options.signal.addEventListener('abort', onAbort, { once: true });
        }

        child.on('error', (err) => {
          options.signal?.removeEventListener('abort', onAbort);
          reject(err);
        });
        child.on('close', (code) => {
          options.signal?.removeEventListener('abort', onAbort);
          if (code === 0) resolve();
          else reject(new Error(`git exited with code ${code ?? 'null'}`));
        });
      });
    },
  };
}
