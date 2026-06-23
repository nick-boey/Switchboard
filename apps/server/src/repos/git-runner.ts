import { spawn } from 'node:child_process';
import type { CloneErrorKind } from '@switchboard/shared';

/**
 * The git subprocess seam (design Decision 4). The clone runs the real `git` CLI (the credential
 * helper is a git-CLI concept). git's stderr is captured ONLY to classify a failure into a typed
 * kind and is then discarded — it is never logged or surfaced, so a GitHub error message can never
 * reach a log (no-leak). Cancellable via an `AbortSignal` (clone abort), and reports its pid for
 * restart recovery.
 */

/** A classified git clone failure. Carries only the typed kind + exit code — never the raw text. */
export class GitCloneError extends Error {
  constructor(
    readonly kind: CloneErrorKind,
    readonly code: number | null,
  ) {
    super(`git clone failed (${kind})`);
    this.name = 'GitCloneError';
  }
}

/** Classify git's stderr into a typed clone error kind (the raw text is then discarded). */
export function classifyGitStderr(stderr: string): CloneErrorKind {
  const s = stderr.toLowerCase();
  if (s.includes('rate limit')) return 'rate-limited';
  if (
    s.includes('authentication failed') ||
    s.includes('could not read username') ||
    s.includes('invalid username or password') ||
    s.includes('terminal prompts disabled') ||
    s.includes('403')
  ) {
    return 'unauthorized';
  }
  if (s.includes('repository not found') || s.includes('not found') || s.includes('404')) {
    return 'not-found';
  }
  return 'git-failure';
}
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
        // stdin/stdout ignored; stderr piped only to classify a failure, then discarded.
        const child = spawn('git', args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        if (typeof child.pid === 'number') options.onSpawn?.(child.pid);

        let stderr = '';
        child.stderr?.on('data', (chunk: Buffer) => {
          // Cap retained stderr so a huge failure output cannot balloon memory.
          if (stderr.length < 8192) stderr += chunk.toString('utf8');
        });

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
          else reject(new GitCloneError(classifyGitStderr(stderr), code));
        });
      });
    },
  };
}
