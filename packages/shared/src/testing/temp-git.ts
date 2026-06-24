import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A throwaway git repository in an OS temp dir, with a teardown hook. */
export interface TempGitRepo {
  /** Absolute path to the repository working tree. */
  path: string;
  /** Run a git subcommand inside the repo and return its stdout. */
  git(...args: string[]): string;
  /**
   * Seed a known branch carrying one commit, then return to the previous branch — so a worktree
   * test has an "existing remote branch" to check out (worktree-management group 1.1). Idempotent
   * enough for a fresh fixture; returns the branch name for convenience.
   */
  seedBranch(name: string): string;
  /** Remove the repository. Idempotent. */
  cleanup(): void;
}

/**
 * Initialize a fresh git repo in `os.tmpdir()` for tests, with an initial empty commit and
 * a deterministic identity. Unused by `foundations` itself but required by later changes
 * (repo clone/browse, etc.); proven here by the Playwright smoke test.
 *
 * Callers MUST invoke `cleanup()` on teardown (the Playwright fixture does this
 * automatically).
 */
export function createTempGitRepo(): TempGitRepo {
  const path = mkdtempSync(join(tmpdir(), 'switchboard-git-'));

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: path, encoding: 'utf8' }).trim();

  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'test@switchboard.local');
  git('config', 'user.name', 'Switchboard Test');
  git('config', 'commit.gpgsign', 'false');
  git('commit', '--allow-empty', '--quiet', '--message', 'init');

  const currentBranch = (): string => git('rev-parse', '--abbrev-ref', 'HEAD');

  let cleaned = false;
  return {
    path,
    git,
    seedBranch(name: string): string {
      const previous = currentBranch();
      git('checkout', '--quiet', '-b', name);
      git('commit', '--allow-empty', '--quiet', '--message', `seed ${name}`);
      git('checkout', '--quiet', previous);
      return name;
    },
    cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      rmSync(path, { recursive: true, force: true });
    },
  };
}
