import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import {
  idForBranch as defaultIdForBranch,
  isSafeBranchName,
  isValidWorktreeId,
  toRepoId,
  type RepoTarget,
  type RuntimeContext,
  type WorktreeMode,
  type WorktreeSummary,
  type WorktreeSync,
} from '@switchboard/shared';
import {
  credentialHelperArgs,
  ensureCredentialHelperScript,
  TOKEN_FILE_ENV,
  writeGithubToken,
} from '../repos/credential-helper.js';
import { createGitRunner, type GitRunner } from '../repos/git-runner.js';
import { createGitService, type GitService } from '../repos/git-service.js';
import { WorktreeCollisionError, WorktreeError } from './errors.js';

/**
 * The worktree operations that extend the Git service inside `Switchboard.Api` (design Decisions
 * 1, 2, 4, 5, 6). Operates on a completed bare clone at `repos/<owner>/<repo>/.bare` and lands
 * worktrees at `repos/<owner>/<repo>/worktrees/<wt-id>`, where the on-disk destination is derived
 * ONLY from a re-validated `<wt-id>` (defence in depth against traversal). The branch name is
 * recovered from git, never decoded from the id. Reuses the credential helper + git-runner seam
 * from `repo-clone-browse`.
 */

export interface WorktreeCreateInput {
  target: RepoTarget;
  branch: string;
  mode: WorktreeMode;
  base?: string;
}

export interface WorktreeCreateResult {
  wtId: string;
}

export interface WorktreeService {
  createWorktree(
    input: WorktreeCreateInput,
    options?: WorktreeRunOptions,
  ): Promise<WorktreeCreateResult>;
  listWorktrees(target: RepoTarget): Promise<WorktreeSummary[]>;
  removeWorktree(target: RepoTarget, wtId: string): Promise<void>;
  /** Cleanup seam for the ledger: remove a worktree only when it is NOT a completed checkout. */
  removeWorktreeIfIncomplete(target: RepoTarget, wtId: string): Promise<void>;
  /** True once the worktree exists on disk AND git reports it (the ledger's `isComplete`). */
  isWorktreeComplete(target: RepoTarget, wtId: string): Promise<boolean>;
  /** Absolute path to a worktree (derived only from a re-validated id). */
  worktreePath(target: RepoTarget, wtId: string): string;
}

export interface WorktreeRunOptions {
  signal?: AbortSignal;
  onSpawn?(pid: number): void;
}

export interface WorktreeServiceDeps {
  gitService?: GitService;
  runner?: GitRunner;
  /** Injectable for tests to force a truncated-hash collision. */
  idForBranch?: (branch: string) => string;
}

/** Map ahead/behind commit counts to the git lamp's coarse sync state (pure). */
export function classifySync(behind: number, ahead: number): WorktreeSync {
  if (behind > 0 && ahead > 0) return 'diverged';
  if (ahead > 0) return 'ahead';
  if (behind > 0) return 'behind';
  return 'up-to-date';
}

/** One worktree as reported by `git worktree list --porcelain` (before id/branch filtering). */
interface RawWorktree {
  path: string;
  branch?: string;
  bare: boolean;
}

function parsePorcelain(stdout: string): RawWorktree[] {
  const out: RawWorktree[] = [];
  let current: RawWorktree | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) out.push(current);
      current = { path: line.slice('worktree '.length), bare: false };
    } else if (current && line === 'bare') {
      current.bare = true;
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === '' && current) {
      out.push(current);
      current = null;
    }
  }
  if (current) out.push(current);
  return out;
}

export function createWorktreeService(
  ctx: RuntimeContext,
  deps: WorktreeServiceDeps = {},
): WorktreeService {
  const runner = deps.runner ?? createGitRunner();
  const gitService = deps.gitService ?? createGitService(ctx, { runner });
  const idForBranch = deps.idForBranch ?? defaultIdForBranch;
  const reposRoot = join(ctx.workspaceRoot, 'repos');

  const repoDir = (t: RepoTarget): string => join(reposRoot, t.owner, t.repo);
  const worktreesRoot = (t: RepoTarget): string => join(repoDir(t), 'worktrees');
  const worktreePath = (t: RepoTarget, wtId: string): string => {
    if (!isValidWorktreeId(wtId)) throw new WorktreeError('git-failure', 'invalid worktree id');
    return join(worktreesRoot(t), wtId);
  };

  const git = async (args: string[], options: WorktreeRunOptions = {}): Promise<string> => {
    const result = await runner.capture(args, options);
    if (result.code !== 0) throw new WorktreeError('git-failure');
    return result.stdout;
  };
  /** Capture without throwing — for existence probes whose non-zero exit is "absent". */
  const probe = (args: string[]): Promise<{ code: number | null; stdout: string }> =>
    runner.capture(args);

  /** Raw `git worktree list --porcelain` entries (no id/branch filtering). */
  const rawWorktrees = async (t: RepoTarget): Promise<RawWorktree[]> => {
    if (!gitService.isComplete(t)) return [];
    const { stdout } = await probe([
      '--git-dir',
      gitService.bareDir(t),
      'worktree',
      'list',
      '--porcelain',
    ]);
    return parsePorcelain(stdout);
  };

  const fetchOrigin = async (t: RepoTarget, options: WorktreeRunOptions): Promise<void> => {
    const bare = gitService.bareDir(t);
    // Ensure remote-tracking refs exist so a worktree can track origin/<branch>.
    await probe([
      '--git-dir',
      bare,
      'config',
      'remote.origin.fetch',
      '+refs/heads/*:refs/remotes/origin/*',
    ]);
    const env: NodeJS.ProcessEnv = { ...process.env };
    let helperArgs: string[] = [];
    if (ctx.config.github) {
      const tokenFile = writeGithubToken(ctx, ctx.config.github.token);
      env[TOKEN_FILE_ENV] = tokenFile;
      helperArgs = credentialHelperArgs(ensureCredentialHelperScript(ctx));
    }
    await runner.capture([...helperArgs, '--git-dir', bare, 'fetch', '--quiet', 'origin'], {
      ...options,
      env,
    });
  };

  const refExists = async (bare: string, ref: string): Promise<boolean> =>
    (await probe(['--git-dir', bare, 'show-ref', '--verify', '--quiet', ref])).code === 0;

  const defaultBranch = async (bare: string): Promise<string> => {
    const { code, stdout } = await probe(['--git-dir', bare, 'symbolic-ref', '--short', 'HEAD']);
    const name = stdout.trim();
    return code === 0 && name ? name : 'HEAD';
  };

  const service: WorktreeService = {
    worktreePath,

    async createWorktree(input, options = {}) {
      const { target, branch, mode } = input;
      // 1. Reject an unsafe/empty branch before any path is built.
      if (!isSafeBranchName(branch)) throw new WorktreeError('git-failure', 'unsafe branch');
      // 2. Require a completed bare clone.
      if (!gitService.isComplete(target)) throw new WorktreeError('no-clone');
      const bare = gitService.bareDir(target);

      // 3. Derive + re-validate the id.
      const wtId = idForBranch(branch);
      if (!isValidWorktreeId(wtId)) throw new WorktreeError('git-failure', 'invalid worktree id');

      // 4. Mandatory create-time collision check (Decision 1) — BEFORE any path/tmux name is built.
      const existing = await rawWorktrees(target);
      for (const wt of existing) {
        if (wt.bare || !wt.branch) continue;
        if (basename(wt.path) !== wtId) continue;
        if (wt.branch === branch) return { wtId }; // same id + same branch → idempotent no-op
        throw new WorktreeCollisionError(); // same id + different branch → reject, never alias
      }

      const path = worktreePath(target, wtId);
      mkdirSync(dirname(path), { recursive: true });

      // Telemetry (Decision 7): sensitive values go under blocklisted keys so the redactor masks
      // them; the branch, `<wt-id>`/slug, and absolute path are never plain attributes.
      ctx.telemetry
        .startSpan('worktree.create', {
          repoId: toRepoId(target),
          branch,
          'worktree.id': wtId,
          'worktree.path': path,
        })
        .end();

      if (mode === 'new') {
        if (await refExists(bare, `refs/heads/${branch}`)) throw new WorktreeError('branch-exists');
        const base = input.base ?? (await defaultBranch(bare));
        await git(['--git-dir', bare, 'worktree', 'add', '-b', branch, path, base], options);
      } else {
        await fetchOrigin(target, options);
        if (await refExists(bare, `refs/heads/${branch}`)) {
          await git(['--git-dir', bare, 'worktree', 'add', path, branch], options);
          // Best-effort tracking so ahead/behind is computable (ignore failure).
          await probe(['-C', path, 'branch', `--set-upstream-to=origin/${branch}`, branch]);
        } else if (await refExists(bare, `refs/remotes/origin/${branch}`)) {
          await git(
            [
              '--git-dir',
              bare,
              'worktree',
              'add',
              '--track',
              '-b',
              branch,
              path,
              `origin/${branch}`,
            ],
            options,
          );
        } else {
          throw new WorktreeError('branch-not-found');
        }
      }

      return { wtId };
    },

    async listWorktrees(target) {
      const raw = await rawWorktrees(target);
      const root = worktreesRoot(target);
      // git stores realpaths (macOS /var→/private/var), so compare resolved parents.
      const realRoot = existsSync(root) ? realpathSync(root) : root;
      const resolve = (p: string): string => (existsSync(p) ? realpathSync(p) : p);
      const summaries: WorktreeSummary[] = [];
      for (const wt of raw) {
        if (wt.bare || !wt.branch) continue;
        // Only worktrees under worktrees/<wt-id> whose id matches the derivation of their branch.
        if (resolve(dirname(wt.path)) !== realRoot) continue;
        const wtId = basename(wt.path);
        if (!isValidWorktreeId(wtId) || wtId !== idForBranch(wt.branch)) continue;

        const dirty =
          (await probe(['-C', wt.path, 'status', '--porcelain'])).stdout.trim().length > 0;
        let sync: WorktreeSync = 'up-to-date';
        const rev = await probe([
          '-C',
          wt.path,
          'rev-list',
          '--left-right',
          '--count',
          '@{upstream}...HEAD',
        ]);
        if (rev.code === 0) {
          const [behind, ahead] = rev.stdout
            .trim()
            .split(/\s+/)
            .map((n) => Number(n) || 0);
          sync = classifySync(behind, ahead);
        }
        summaries.push({
          wtId,
          branch: wt.branch,
          path: relative(ctx.workspaceRoot, wt.path),
          dirty,
          sync,
        });
      }
      ctx.telemetry.startSpan('worktree.list', { repoId: toRepoId(target) }).end();
      return summaries;
    },

    async removeWorktree(target, wtId) {
      const bare = gitService.bareDir(target);
      const path = worktreePath(target, wtId);
      ctx.telemetry
        .startSpan('worktree.delete', {
          repoId: toRepoId(target),
          'worktree.id': wtId,
          'worktree.path': path,
        })
        .end();
      // Remove ONLY the checkout: never the bare clone, a sibling, or the git branch.
      await probe(['--git-dir', bare, 'worktree', 'remove', '--force', path]);
      await probe(['--git-dir', bare, 'worktree', 'prune']);
      rmSync(path, { recursive: true, force: true });
    },

    async isWorktreeComplete(target, wtId) {
      const path = worktreePath(target, wtId);
      if (!existsSync(path)) return false;
      const raw = await rawWorktrees(target);
      return raw.some((wt) => !wt.bare && basename(wt.path) === wtId);
    },

    async removeWorktreeIfIncomplete(target, wtId) {
      if (await service.isWorktreeComplete(target, wtId)) return;
      await service.removeWorktree(target, wtId);
    },
  };

  return service;
}
