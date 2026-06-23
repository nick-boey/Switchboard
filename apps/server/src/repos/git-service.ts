import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isValidRepoId, toRepoId, type RepoTarget, type RuntimeContext } from '@switchboard/shared';
import {
  credentialHelperArgs,
  ensureCredentialHelperScript,
  TOKEN_FILE_ENV,
  writeGithubToken,
} from './credential-helper.js';
import { createGitRunner, type GitRunner } from './git-runner.js';

/**
 * The Git service (design Decisions 4–5): bare-clone a validated `<owner>/<repo>` to
 * `~/.switchboard/repos/<owner>/<repo>/.bare` using the plain HTTPS URL (the PAT is supplied only
 * via the credential helper), mark a completed clone, and list completed clones from disk. The
 * on-disk destination is derived ONLY from a re-validated id (defence in depth against traversal).
 */

export interface CloneOptions {
  signal?: AbortSignal;
  onSpawn?(pid: number): void;
  /** Override the clone source (tests use a local temp-git remote). */
  remoteUrl?: string;
}

export interface GitService {
  cloneBare(target: RepoTarget, options?: CloneOptions): Promise<void>;
  listCloned(): Promise<RepoTarget[]>;
  isCloned(target: RepoTarget): boolean;
  /** Remove a target's directory (used by ledger cleanup); a completed clone is never removed. */
  removeIfIncomplete(target: RepoTarget): void;
  /** True once a target's completion marker is present. */
  isComplete(target: RepoTarget): boolean;
  /** Absolute path to a target's bare repo (for diagnostics/tests). */
  bareDir(target: RepoTarget): string;
}

export interface GitServiceDeps {
  runner?: GitRunner;
}

/** The plain HTTPS clone URL — no embedded credentials (Decision 4). */
export function cloneUrlFor(target: RepoTarget): string {
  return `https://github.com/${target.owner}/${target.repo}.git`;
}

function assertSafeTarget(target: RepoTarget): void {
  if (!isValidRepoId(toRepoId(target))) {
    throw new Error('unsafe repository target');
  }
}

export function createGitService(ctx: RuntimeContext, deps: GitServiceDeps = {}): GitService {
  const runner = deps.runner ?? createGitRunner();
  const reposRoot = join(ctx.workspaceRoot, 'repos');

  const repoDir = (target: RepoTarget): string => join(reposRoot, target.owner, target.repo);
  const bareDir = (target: RepoTarget): string => join(repoDir(target), '.bare');
  const markerPath = (target: RepoTarget): string => join(repoDir(target), '.clone-complete');

  const service: GitService = {
    bareDir,

    isComplete: (target) => existsSync(markerPath(target)),
    isCloned: (target) => existsSync(markerPath(target)),

    async cloneBare(target, options = {}) {
      assertSafeTarget(target);
      const dest = bareDir(target);
      mkdirSync(repoDir(target), { recursive: true });

      const url = options.remoteUrl ?? cloneUrlFor(target);
      const env: NodeJS.ProcessEnv = { ...process.env };
      let helperArgs: string[] = [];
      // Wire the credential helper whenever a PAT is configured. It is host-scoped to github.com
      // (so a local-remote test clone never invokes it) and passed only via `-c`, never persisted.
      if (ctx.config.github) {
        const tokenFile = writeGithubToken(ctx, ctx.config.github.token);
        env[TOKEN_FILE_ENV] = tokenFile;
        helperArgs = credentialHelperArgs(ensureCredentialHelperScript(ctx));
      }

      const args = [...helperArgs, 'clone', '--bare', url, dest];
      // Telemetry: sensitive values go under blocklisted keys so the redactor masks them; the PAT
      // is never an attribute (it is never in the URL or argv).
      ctx.telemetry
        .startSpan('repo.clone', {
          repoId: toRepoId(target),
          'clone.url': url,
          'git.args': args.join(' '),
          'repo.path': dest,
        })
        .end();

      await runner.run(args, { env, signal: options.signal, onSpawn: options.onSpawn });
      writeFileSync(markerPath(target), '');
    },

    async listCloned() {
      if (!existsSync(reposRoot)) return [];
      const cloned: RepoTarget[] = [];
      for (const owner of readdirSync(reposRoot, { withFileTypes: true })) {
        if (!owner.isDirectory()) continue;
        const ownerDir = join(reposRoot, owner.name);
        for (const repo of readdirSync(ownerDir, { withFileTypes: true })) {
          if (!repo.isDirectory()) continue;
          const target = { owner: owner.name, repo: repo.name };
          if (service.isComplete(target)) cloned.push(target);
        }
      }
      return cloned;
    },

    removeIfIncomplete(target) {
      if (service.isComplete(target)) return;
      rmSync(repoDir(target), { recursive: true, force: true });
    },
  };

  return service;
}
