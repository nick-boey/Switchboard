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

/** Outcome of a captured git invocation — the exit code and stdout, never stderr (no-leak). */
export interface GitCaptureResult {
  code: number | null;
  stdout: string;
}

export interface GitRunner {
  /** Run `git <args>`; resolves on exit 0, rejects otherwise (message carries the code, no body). */
  run(args: string[], options?: GitRunOptions): Promise<void>;
  /**
   * Run `git <args>` capturing stdout, **never throwing on a non-zero exit** (the caller inspects
   * `code`). stderr is discarded unread so a git/GitHub error body can never reach a log or a
   * thrown message (no-leak). Used by the worktree operations for both reads (`worktree list`,
   * `status`, `rev-list`, `show-ref`) and mutations (`worktree add/remove`, `fetch`).
   */
  capture(args: string[], options?: GitRunOptions): Promise<GitCaptureResult>;
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

    capture(args, options = {}) {
      return new Promise<GitCaptureResult>((resolve, reject) => {
        // stdout piped + captured; stderr discarded unread (no-leak — error bodies never surface).
        const child = spawn('git', args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (typeof child.pid === 'number') options.onSpawn?.(child.pid);

        let stdout = '';
        child.stdout?.on('data', (chunk: Buffer) => {
          if (stdout.length < 1_000_000) stdout += chunk.toString('utf8');
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
          resolve({ code, stdout });
        });
      });
    },
  };
}
