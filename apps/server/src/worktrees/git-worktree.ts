import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  /**
   * Cleanup seam for the ledger: remove a worktree only when it is NOT a completed checkout AND the
   * destination is provably owned by THIS operation — i.e. an ownership marker exists whose token
   * equals `expectedToken` (the failed operation's own token, from its metadata). A path with a
   * missing, stale, or foreign marker (or when no token is supplied) is left untouched.
   */
  removeWorktreeIfIncomplete(
    target: RepoTarget,
    wtId: string,
    expectedToken?: string,
  ): Promise<void>;
  /** True once the worktree exists on disk AND git reports it (the ledger's `isComplete`). */
  isWorktreeComplete(target: RepoTarget, wtId: string): Promise<boolean>;
  /** Absolute path to a worktree (derived only from a re-validated id). */
  worktreePath(target: RepoTarget, wtId: string): string;
}

export interface WorktreeRunOptions {
  signal?: AbortSignal;
  /** May return a promise; the runner awaits it so the pid is persisted before the process exit. */
  onSpawn?(pid: number): void | Promise<void>;
  /**
   * Operation-scoped ownership token — this attempt's unique claim on the destination path. It is
   * written verbatim as the ownership marker's content BEFORE any filesystem mutation, and threaded
   * (via the operation's metadata) into the cleanup path so that ONLY this exact operation's partial
   * is removable. A retry is a new operation with a new token, so a stale marker can never authorize
   * deleting another operation's or a user's data. Defaults to a fresh `randomUUID()` when omitted.
   */
  token?: string;
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
  // Ownership marker: a sibling file written just AFTER this operation atomically claims the
  // destination, and removed only on success. Its CONTENT is JSON `{ token, dev, ino }` — this
  // attempt's unique token PLUS the filesystem-object identity (dev+ino) of the directory the
  // exclusive create produced. Ownership is therefore OPERATION-SCOPED *and* IDENTITY-BOUND: a marker
  // proves cleanup may delete `worktreePath` only when its token matches THIS op's token AND the
  // directory still on disk is the SAME fs object (dev+ino). A path with a missing/stale/foreign
  // marker — or one whose dir was removed and REPLACED by a different object at the same pathname —
  // is someone else's data and failure-cleanup never recursively deletes it. A retry is a new
  // operation with a new token, so a stale marker can never re-authorize a delete.
  const pendingMarkerPath = (t: RepoTarget, wtId: string): string =>
    `${worktreePath(t, wtId)}.pending`;
  interface OwnershipMarker {
    token: string;
    dev: number;
    ino: number;
  }
  /** Parse the ownership marker; `null` when absent or malformed (neither proves ownership). */
  const readMarker = (marker: string): OwnershipMarker | null => {
    if (!existsSync(marker)) return null;
    try {
      const parsed = JSON.parse(readFileSync(marker, 'utf8')) as Partial<OwnershipMarker>;
      if (
        typeof parsed.token === 'string' &&
        typeof parsed.dev === 'number' &&
        typeof parsed.ino === 'number'
      ) {
        return { token: parsed.token, dev: parsed.dev, ino: parsed.ino };
      }
    } catch {
      // Unparseable marker content proves nothing — treat as no ownership.
    }
    return null;
  };
  /** The fs-object identity of the dir at `path` (lstat, never following a symlink), or `null`. */
  const dirIdentity = (path: string): { dev: number; ino: number } | null => {
    try {
      const st = lstatSync(path);
      return { dev: st.dev, ino: st.ino };
    } catch {
      return null; // path is gone or unreadable
    }
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

  // True only when git reports a NON-bare worktree at exactly `worktrees/<wtId>` under THIS repo's
  // worktrees root. Paths are compared as realpaths (macOS /var→/private/var) so a symlinked entry
  // cannot masquerade as living under the root. This is the registration proof the user-delete path
  // requires BEFORE any filesystem removal (Finding B): a normal/user directory git never managed as
  // a worktree is not removable, even when its `<wt-id>` is structurally valid.
  const isRegisteredWorktree = async (t: RepoTarget, wtId: string): Promise<boolean> => {
    const raw = await rawWorktrees(t);
    const root = worktreesRoot(t);
    const realRoot = existsSync(root) ? realpathSync(root) : root;
    const resolve = (p: string): string => (existsSync(p) ? realpathSync(p) : p);
    return raw.some(
      (wt) => !wt.bare && basename(wt.path) === wtId && resolve(dirname(wt.path)) === realRoot,
    );
  };

  // Remove ONLY the leaf checkout directory + prune the admin entry — never a parent, a sibling, the
  // bare clone, or the branch. The CALLER must first establish the right to delete `path` (git
  // registration for the user-delete path; atomic-create + token ownership for failure cleanup); the
  // best-effort `worktree remove` covers a half-registered partial, then the leaf is rmSync-ed.
  const forceRemoveLeaf = async (bare: string, path: string): Promise<void> => {
    await probe(['--git-dir', bare, 'worktree', 'remove', '--force', path]);
    await probe(['--git-dir', bare, 'worktree', 'prune']);
    rmSync(path, { recursive: true, force: true });
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
      // This attempt's unique ownership token. The orchestrator generates it, stores it in the
      // operation's metadata, and threads it here; a direct caller defaults to a fresh uuid.
      const token = options.token ?? randomUUID();
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
      const marker = pendingMarkerPath(target, wtId);
      // Ensure the worktrees/ container exists (a shared parent, never user data).
      mkdirSync(worktreesRoot(target), { recursive: true });

      // 5. ATOMIC destination claim (data-loss guard, Finding A). EXCLUSIVELY create the destination
      // directory itself with `recursive: false`: an already-existing path fails atomically with
      // EEXIST, so there is NO existsSync→write TOCTOU window in which a foreign process could plant
      // a directory we then mark as "owned" and later delete. The collision check above only sees
      // git-registered worktrees; a NORMAL directory already at `path` (a user's dir, a stray dir, or
      // a different op's partial) makes the exclusive create fail → typed `dest-exists`, and we NEVER
      // claim (mark) it, so failure-cleanup can never delete it. git's `worktree add` accepts a
      // pre-existing EMPTY directory (verified against git 2.x), so this exclusive claim composes
      // with the add below.
      try {
        mkdirSync(path, { recursive: false });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new WorktreeError('dest-exists', 'worktree destination already exists');
        }
        throw err;
      }
      // Capture the filesystem-object identity (dev+ino) of the directory the exclusive create just
      // produced, while we still hold the only reference to it.
      const claimed = lstatSync(path);
      // Record THIS operation's atomic ownership of `path`: the marker's CONTENT is JSON pairing this
      // op's token with the claimed dir's identity, written ONLY AFTER the exclusive create succeeded
      // — so a matching marker is durable proof that THIS exact operation atomically created the
      // destination AND that the directory still there is the same object (it can never be planted
      // beside a foreign dir, nor re-authorize deleting a replacement object at the same pathname).
      // Released on success (below); kept on failure for the identity-bound, token-gated cleanup,
      // which therefore deletes only a destination this operation provably created and still owns.
      writeFileSync(marker, JSON.stringify({ token, dev: claimed.dev, ino: claimed.ino }));

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

      // Success: release the ownership claim. A completed worktree is recognised by git, so cleanup
      // never touches it — and a lingering marker must not let a future user dir be mistaken as ours.
      rmSync(marker, { force: true });
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
      const path = worktreePath(target, wtId); // re-validates the id (defence against traversal)
      ctx.telemetry
        .startSpan('worktree.delete', {
          repoId: toRepoId(target),
          'worktree.id': wtId,
          'worktree.path': path,
        })
        .end();
      // Registration guard (Finding B): the user-delete path forces git's removal, so it MUST first
      // confirm git actually manages a worktree at exactly this path under THIS repo's worktrees
      // root. A normal/user directory git never registered (or an absent id) is refused with a typed
      // error and NEVER rmSync-ed — `force` bypasses git's safe-to-delete, but not this guard.
      if (!(await isRegisteredWorktree(target, wtId))) {
        throw new WorktreeError('dest-not-managed', 'worktree is not git-managed');
      }
      // Remove ONLY the checkout: never the bare clone, a sibling, or the git branch. Honor git's
      // result — only clear a leftover remnant once git acknowledged removing the registered worktree
      // (never blindly rmSync a path git declined to remove).
      const removed = await probe(['--git-dir', bare, 'worktree', 'remove', '--force', path]);
      await probe(['--git-dir', bare, 'worktree', 'prune']);
      if (removed.code !== 0) throw new WorktreeError('git-failure', 'worktree remove failed');
      if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    },

    async isWorktreeComplete(target, wtId) {
      const path = worktreePath(target, wtId);
      if (!existsSync(path)) return false;
      const raw = await rawWorktrees(target);
      return raw.some((wt) => !wt.bare && basename(wt.path) === wtId);
    },

    async removeWorktreeIfIncomplete(target, wtId, expectedToken) {
      if (await service.isWorktreeComplete(target, wtId)) return;
      const bare = gitService.bareDir(target);
      const path = worktreePath(target, wtId);
      const marker = pendingMarkerPath(target, wtId);
      // Operation-scoped, IDENTITY-BOUND ownership proof. A directory on disk is deletable ONLY when
      // the ownership marker proves THIS operation atomically created it AND it is still the same fs
      // object. (1) TOKEN gate: the marker's token must equal the failed op's own `expectedToken`
      // (from its metadata). A missing, stale, foreign, or malformed marker — or no expected token —
      // means this op never created this path (git also does not report it), so it is someone else's
      // data: NEVER touch the path or another op's marker.
      const m = readMarker(marker);
      if (expectedToken === undefined || m === null || m.token !== expectedToken) return;
      // Our token matched. (2) IDENTITY gate: the directory must still be the SAME fs object (dev+ino)
      // we claimed. If a DIFFERENT object now lives at the pathname (the partial was removed and
      // REPLACED, e.g. with user data), a matching token alone must NOT authorize deleting it — clear
      // only this op's now-stale marker and leave the replacement path untouched.
      const id = dirIdentity(path);
      if (id !== null && (id.dev !== m.dev || id.ino !== m.ino)) {
        rmSync(marker, { force: true });
        return;
      }
      // Either the path is gone (id === null) or its identity matches: removing the leaf is safe
      // (rmSync on an absent path is a no-op) and the marker is genuinely ours to clear. Authorized by
      // atomic-create + token + identity — NOT routed through the registration-guarded user-delete
      // path, because a genuine partial this op created is by definition not yet a git-registered
      // worktree. Removes only the owned leaf.
      await forceRemoveLeaf(bare, path);
      rmSync(marker, { force: true });
    },
  };

  return service;
}
