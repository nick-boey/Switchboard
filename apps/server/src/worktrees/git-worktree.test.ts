import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idForBranch } from '@switchboard/shared';
import { makeServerTestContext } from '../testing/operation-scaffolding.js';
import {
  createWorktreeFixture,
  worktreesDir,
  type WorktreeFixture,
} from '../testing/worktree-fixture.js';
import { createGitRunner, type GitRunner } from '../repos/git-runner.js';
import { classifySync, createWorktreeService, type WorktreeService } from './git-worktree.js';
import { WorktreeCollisionError, WorktreeError } from './errors.js';

/**
 * Failing-first tests for the worktree Git service (task 3.1), on a real bare clone of the temp-git
 * fixture: create lands a checkout at `repos/<owner>/<repo>/worktrees/<wt-id>` on the branch
 * (existing-remote tracked, or a new branch from a base); create requires a completed clone and
 * rejects an unsafe branch before any path is built; a forced `<wt-id>`/different-branch collision
 * is detected + rejected (id never mutated); slug-colliding pairs each get a distinct directory on
 * the case-insensitive FS; list maps id↔branch with git-status and ignores foreign dirs; delete
 * removes only the target (bare + siblings + branch survive).
 */
describe('worktree Git service', () => {
  let fx: WorktreeFixture;
  let service: WorktreeService;

  const branchOf = (wtPath: string): string =>
    execFileSync('git', ['-C', wtPath, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  const headOf = (gitArgs: string[]): string =>
    execFileSync('git', [...gitArgs, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const bareRev = (ref: string): string =>
    execFileSync('git', ['--git-dir', fx.bareDir, 'rev-parse', ref], { encoding: 'utf8' }).trim();
  // Move the LOCAL `refs/heads/<branch>` forward with a commit that exists only locally (never on
  // the remote), via a throwaway worktree — so the local branch diverges from origin/<branch>.
  const addLocalOnlyCommit = (branch: string): string => {
    const tmp = mkdtempSync(join(tmpdir(), 'sb-local-'));
    execFileSync('git', ['--git-dir', fx.bareDir, 'worktree', 'add', '--quiet', tmp, branch]);
    execFileSync('git', [
      '-C',
      tmp,
      'commit',
      '--allow-empty',
      '--quiet',
      '--message',
      `local-only on ${branch}`,
    ]);
    const sha = headOf(['-C', tmp]);
    execFileSync('git', ['--git-dir', fx.bareDir, 'worktree', 'remove', '--force', tmp]);
    return sha;
  };
  const branchExists = (branch: string): boolean => {
    const out = execFileSync(
      'git',
      ['--git-dir', fx.bareDir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      { encoding: 'utf8' },
    );
    return out.split('\n').includes(branch);
  };

  beforeEach(async () => {
    fx = await createWorktreeFixture();
    service = createWorktreeService(fx.ctx, { gitService: fx.gitService });
  });
  afterEach(() => fx.cleanup());

  it('lands a new-branch worktree at the canonical path on the branch', async () => {
    const { wtId } = await service.createWorktree({
      target: fx.target,
      branch: 'feature/brand-new',
      mode: 'new',
    });
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    expect(wtId).toBe(idForBranch('feature/brand-new'));
    expect(existsSync(join(path, '.git'))).toBe(true); // a real working tree (file pointing at bare)
    expect(branchOf(path)).toBe('feature/brand-new');
    // The bare repo is untouched alongside.
    expect(existsSync(join(fx.bareDir, 'HEAD'))).toBe(true);
  });

  it('checks out and tracks an existing remote branch', async () => {
    const { wtId } = await service.createWorktree({
      target: fx.target,
      branch: fx.existingBranch,
      mode: 'existing-remote',
    });
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    expect(branchOf(path)).toBe(fx.existingBranch);
    // Tracking origin/<branch> was set up → ahead/behind is computable against @{upstream}.
    const upstream = execFileSync(
      'git',
      ['-C', path, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
      { encoding: 'utf8' },
    ).trim();
    expect(upstream).toBe(`origin/${fx.existingBranch}`);
  });

  it('creates a new branch from the default base when none is given', async () => {
    const { wtId } = await service.createWorktree({
      target: fx.target,
      branch: 'feature/from-default',
      mode: 'new',
    });
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    // The new branch points at the default branch's tip (origin HEAD = main).
    const wtHead = execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const mainHead = execFileSync('git', ['--git-dir', fx.bareDir, 'rev-parse', 'main'], {
      encoding: 'utf8',
    }).trim();
    expect(wtHead).toBe(mainHead);
  });

  it('builds the worktree from the up-to-date remote tip, not a stale local base (regression)', async () => {
    // The remote advances AFTER the bare clone, so the local branch refs are now stale.
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances main');
    const remoteMain = fx.remote.git('rev-parse', 'main');
    fx.remote.git('checkout', '--quiet', fx.existingBranch);
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances feature');
    const remoteFeature = fx.remote.git('rev-parse', fx.existingBranch);
    fx.remote.git('checkout', '--quiet', 'main');

    // mode 'new': the new branch must be cut from the refreshed base (origin/main), not stale local.
    const created = await service.createWorktree({
      target: fx.target,
      branch: 'feature/off-fresh-base',
      mode: 'new',
    });
    const newPath = join(worktreesDir(fx.ctx, fx.target), created.wtId);
    expect(headOf(['-C', newPath])).toBe(remoteMain);

    // mode 'existing-remote' (local branch already present): the checkout must land at the latest
    // remote tip, not the stale local branch tip.
    const existing = await service.createWorktree({
      target: fx.target,
      branch: fx.existingBranch,
      mode: 'existing-remote',
    });
    const existingPath = join(worktreesDir(fx.ctx, fx.target), existing.wtId);
    expect(headOf(['-C', existingPath])).toBe(remoteFeature);
  });

  it('preserves a divergent base when creating a new branch (fast-forward-only)', async () => {
    // Local `main` gains a local-only commit; the remote advances main differently → diverged.
    const localMain = addLocalOnlyCommit('main');
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances main');
    const remoteMain = fx.remote.git('rev-parse', 'main');
    expect(localMain).not.toBe(remoteMain);

    const created = await service.createWorktree({
      target: fx.target,
      branch: 'feature/off-diverged-base',
      mode: 'new',
    });
    const path = join(worktreesDir(fx.ctx, fx.target), created.wtId);
    // FF-only: the base is NOT reset to the remote tip; the new branch is cut from the local base.
    expect(headOf(['-C', path])).toBe(localMain);
    expect(bareRev('main')).toBe(localMain); // local main kept its local-only commit
    expect(bareRev('main')).not.toBe(remoteMain);
  });

  it('preserves a divergent existing-remote branch (checks out the local tip, not the remote)', async () => {
    const localTip = addLocalOnlyCommit(fx.existingBranch);
    fx.remote.git('checkout', '--quiet', fx.existingBranch);
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances feature');
    const remoteTip = fx.remote.git('rev-parse', fx.existingBranch);
    fx.remote.git('checkout', '--quiet', 'main');
    expect(localTip).not.toBe(remoteTip);

    const created = await service.createWorktree({
      target: fx.target,
      branch: fx.existingBranch,
      mode: 'existing-remote',
    });
    const path = join(worktreesDir(fx.ctx, fx.target), created.wtId);
    // The local-only commit is preserved: checkout is at the local tip, never reset to the remote.
    expect(headOf(['-C', path])).toBe(localTip);
    expect(headOf(['-C', path])).not.toBe(remoteTip);
  });

  it('still creates a worktree when the remote fetch fails (best-effort, no throw)', async () => {
    // A runner whose `fetch` always fails simulates an unreachable remote / auth failure.
    const real = createGitRunner();
    const runner: GitRunner = {
      run: (a, o) => real.run(a, o),
      capture: (a, o) =>
        a.includes('fetch') ? Promise.resolve({ code: 1, stdout: '' }) : real.capture(a, o),
    };
    const svc = createWorktreeService(fx.ctx, { gitService: fx.gitService, runner });
    // The remote advances, but with the fetch broken the worktree must still build from the local base.
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances main');
    const localMain = headOf(['--git-dir', fx.bareDir]);

    const created = await svc.createWorktree({
      target: fx.target,
      branch: 'feature/offline',
      mode: 'new',
    });
    const path = join(worktreesDir(fx.ctx, fx.target), created.wtId);
    expect(existsSync(join(path, '.git'))).toBe(true);
    expect(headOf(['-C', path])).toBe(localMain); // stale local base, not the (unreachable) remote tip
  });

  it('updateBranchFromRemote fast-forwards a behind branch and is a no-op on divergence (callable directly)', async () => {
    // Behind: the remote advances, the local branch can fast-forward → the local ref advances.
    fx.remote.git('checkout', '--quiet', fx.existingBranch);
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances feature');
    const remoteTip = fx.remote.git('rev-parse', fx.existingBranch);
    fx.remote.git('checkout', '--quiet', 'main');

    const ff = await service.updateBranchFromRemote(fx.target, fx.existingBranch);
    expect(ff).toBe(true);
    expect(bareRev(fx.existingBranch)).toBe(remoteTip); // local branch fast-forwarded to the remote

    // Divergence: a local-only commit + a different remote tip → FF refused, local ref untouched.
    const localTip = addLocalOnlyCommit(fx.existingBranch);
    fx.remote.git('checkout', '--quiet', fx.existingBranch);
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote diverges feature');
    fx.remote.git('checkout', '--quiet', 'main');

    const diverged = await service.updateBranchFromRemote(fx.target, fx.existingBranch);
    expect(diverged).toBe(false);
    expect(bareRev(fx.existingBranch)).toBe(localTip); // local-only commit preserved
  });

  it('does not leak the branch name into telemetry when refreshing on create', async () => {
    const branch = 'feature/secret-branch-name';
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances main');
    await service.createWorktree({ target: fx.target, branch, mode: 'new' });
    // The branch (whose slug echoes it) must not appear in any captured span name or attribute.
    expect(fx.telemetry.containsSecret(branch)).toBe(false);
  });

  it('cuts a new branch from the up-to-date remote base even when the base is checked out elsewhere', async () => {
    // Occupy `main` in a linked worktree so its local ref can no longer be fast-forwarded by a fetch.
    const occupied = mkdtempSync(join(tmpdir(), 'sb-busy-base-'));
    execFileSync('git', ['--git-dir', fx.bareDir, 'worktree', 'add', '--quiet', occupied, 'main']);
    const localMainBefore = bareRev('main');
    // The remote advances main.
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances main');
    const remoteMain = fx.remote.git('rev-parse', 'main');
    expect(remoteMain).not.toBe(localMainBefore);

    const created = await service.createWorktree({
      target: fx.target,
      branch: 'feature/off-busy-base',
      mode: 'new',
    });
    const path = join(worktreesDir(fx.ctx, fx.target), created.wtId);
    // The new branch is cut from the fresh remote tip (origin/main), not the still-stale local main.
    expect(headOf(['-C', path])).toBe(remoteMain);
    // The checked-out local main was never force-moved, so its own worktree stays consistent.
    expect(bareRev('main')).toBe(localMainBefore);

    execFileSync('git', ['--git-dir', fx.bareDir, 'worktree', 'remove', '--force', occupied]);
  });

  it('updateBranchFromRemote also advances the remote-tracking ref (origin/<branch>)', async () => {
    fx.remote.git('checkout', '--quiet', fx.existingBranch);
    fx.remote.git('commit', '--allow-empty', '--quiet', '--message', 'remote advances feature');
    const remoteTip = fx.remote.git('rev-parse', fx.existingBranch);
    fx.remote.git('checkout', '--quiet', 'main');

    const ok = await service.updateBranchFromRemote(fx.target, fx.existingBranch);
    expect(ok).toBe(true);
    expect(bareRev(fx.existingBranch)).toBe(remoteTip); // local branch fast-forwarded
    // The upstream tracking ref is refreshed too, so later ahead/behind stays correct.
    expect(bareRev(`refs/remotes/origin/${fx.existingBranch}`)).toBe(remoteTip);
  });

  it('requires a completed bare clone', async () => {
    const { ctx } = makeServerTestContext();
    const orphan = createWorktreeService(ctx, {});
    await expect(
      orphan.createWorktree({ target: { owner: 'no', repo: 'clone' }, branch: 'x', mode: 'new' }),
    ).rejects.toMatchObject({ kind: 'no-clone' });
    // No worktree directory was created.
    expect(existsSync(join(ctx.workspaceRoot, 'repos', 'no', 'clone'))).toBe(false);
  });

  it('rejects an unsafe/empty branch before any path is built', async () => {
    await expect(
      service.createWorktree({ target: fx.target, branch: '   ', mode: 'new' }),
    ).rejects.toBeInstanceOf(WorktreeError);
    await expect(
      service.createWorktree({ target: fx.target, branch: 'a\tb', mode: 'new' }),
    ).rejects.toBeInstanceOf(WorktreeError);
  });

  it('detects and rejects a forced same-id/different-branch collision without mutating the id', async () => {
    // A stubbed idForBranch maps two DISTINCT branches onto ONE id → forced truncated-hash collision.
    const collidingId = 'collide--0123456789ab';
    const stub = createWorktreeService(fx.ctx, {
      gitService: fx.gitService,
      idForBranch: () => collidingId,
    });
    await stub.createWorktree({ target: fx.target, branch: 'first-branch', mode: 'new' });
    // The second create (a DIFFERENT branch) derives the same id → must be rejected.
    await expect(
      stub.createWorktree({ target: fx.target, branch: 'second-branch', mode: 'new' }),
    ).rejects.toBeInstanceOf(WorktreeCollisionError);
    // Only ONE worktree directory exists — the id was never extended or aliased.
    const dirs = execFileSync('git', ['--git-dir', fx.bareDir, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
    });
    expect(dirs.split('\n').filter((l) => l.endsWith(collidingId)).length).toBe(1);
  });

  it('gives slug-colliding branches distinct worktree directories (no aliasing on a case-insensitive FS)', async () => {
    // `feature/x` and `feature-x` both slug to `feature-x`, but the hash over raw bytes differs.
    const a = await service.createWorktree({ target: fx.target, branch: 'feature/x', mode: 'new' });
    const b = await service.createWorktree({ target: fx.target, branch: 'feature-x', mode: 'new' });
    expect(a.wtId).not.toBe(b.wtId);
    expect(existsSync(join(worktreesDir(fx.ctx, fx.target), a.wtId))).toBe(true);
    expect(existsSync(join(worktreesDir(fx.ctx, fx.target), b.wtId))).toBe(true);
    // And the case-folding pair the spec names derives distinct on-disk destinations too.
    expect(service.worktreePath(fx.target, idForBranch('Feature/X'))).not.toBe(
      service.worktreePath(fx.target, idForBranch('feature/x')),
    );
  });

  it('lists worktrees with id↔branch mapping + git-status and ignores foreign dirs', async () => {
    await service.createWorktree({ target: fx.target, branch: 'feature/listed', mode: 'new' });
    const wtId = idForBranch('feature/listed');
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    // Make it dirty.
    writeFileSync(join(path, 'scratch.txt'), 'wip');

    // A hand-placed foreign directory under worktrees/ must be ignored (not a git worktree).
    mkdirSync(join(worktreesDir(fx.ctx, fx.target), 'foreign--000000000000'), { recursive: true });

    const list = await service.listWorktrees(fx.target);
    const summary = list.find((w) => w.wtId === wtId);
    expect(summary).toBeDefined();
    expect(summary?.branch).toBe('feature/listed');
    expect(summary?.dirty).toBe(true);
    expect(summary?.sync).toBe('up-to-date');
    expect(summary?.path).toContain(wtId);
    // The foreign dir is not listed.
    expect(list.some((w) => w.wtId === 'foreign--000000000000')).toBe(false);
  });

  it('deletes only the target worktree — bare, siblings, and the branch survive', async () => {
    const keep = await service.createWorktree({
      target: fx.target,
      branch: 'feature/keep',
      mode: 'new',
    });
    const drop = await service.createWorktree({
      target: fx.target,
      branch: 'feature/drop',
      mode: 'new',
    });
    const dropPath = join(worktreesDir(fx.ctx, fx.target), drop.wtId);

    await service.removeWorktree(fx.target, drop.wtId);

    expect(existsSync(dropPath)).toBe(false);
    // Sibling worktree + bare repo intact.
    expect(existsSync(join(worktreesDir(fx.ctx, fx.target), keep.wtId))).toBe(true);
    expect(existsSync(join(fx.bareDir, 'HEAD'))).toBe(true);
    // The git branch is NOT deleted.
    expect(branchExists('feature/drop')).toBe(true);
    // git no longer lists the removed worktree.
    const list = await service.listWorktrees(fx.target);
    expect(list.some((w) => w.wtId === drop.wtId)).toBe(false);
  });

  it('refuses to create over a pre-existing UNOWNED directory and never deletes it on cleanup', async () => {
    // Data-loss regression: a pre-existing NORMAL directory (a user's data, or a stray dir) sits
    // at worktrees/<idForBranch(branch)>. It is NOT a git worktree and was NOT created by this op
    // (no ownership marker at all).
    const branch = 'feature/pre-existing';
    const wtId = idForBranch(branch);
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    mkdirSync(path, { recursive: true });
    const sentinel = join(path, 'precious.txt');
    writeFileSync(sentinel, 'do-not-delete');

    // The create must FAIL because the destination already exists and no marker proves THIS op
    // (token-this) owns it — and it must NOT claim ownership of (mark) that path.
    await expect(
      service.createWorktree({ target: fx.target, branch, mode: 'new' }, { token: 'token-this' }),
    ).rejects.toMatchObject({ kind: 'dest-exists' });

    // Drive the exact failure-cleanup path the ledger runs on a failed/aborted op, with THIS op's
    // expected token: an unmarked path is never ours, so cleanup must leave it untouched.
    await service.removeWorktreeIfIncomplete(fx.target, wtId, 'token-this');

    // The pre-existing directory AND its sentinel survive: cleanup must NEVER delete a path this
    // operation did not create. (No ownership proof → leave it untouched.)
    expect(existsSync(path)).toBe(true);
    expect(existsSync(sentinel)).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('do-not-delete');
  });

  it('a STALE/foreign marker (another op token) never authorizes deleting user data at the path', async () => {
    // The remaining data-loss path the op-scoped token closes: a marker carrying a DIFFERENT op's
    // token (token-A) lingers beside the destination (e.g. left by the conservative no-pid
    // reconcile while the path was absent). Later "someone else" creates a real directory + a
    // sentinel at that path. A NEW create op with its OWN token (token-B, same branch / wt-id) must
    // REFUSE (the marker does not prove token-B owns the path), and the failure-cleanup for op-B
    // (expected token-B) must leave the foreign-marked user data fully intact.
    const branch = 'feature/stale-marker';
    const wtId = idForBranch(branch);
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    const marker = `${path}.pending`;

    mkdirSync(path, { recursive: true }); // creates worktrees/ parent too
    const sentinel = join(path, 'precious.txt');
    writeFileSync(sentinel, 'do-not-delete'); // someone else's data
    // A foreign/stale marker from a different operation (token-A) recording THIS dir's identity, so
    // even identity matches — only the non-matching token must refuse op-B's cleanup.
    const fid = lstatSync(path);
    writeFileSync(marker, JSON.stringify({ token: 'token-A', dev: fid.dev, ino: fid.ino }));

    // A NEW create op with a DIFFERENT token → dest exists, marker is foreign → typed refusal.
    await expect(
      service.createWorktree({ target: fx.target, branch, mode: 'new' }, { token: 'token-B' }),
    ).rejects.toMatchObject({ kind: 'dest-exists' });

    // Failure-cleanup for op-B (expected token-B) must NOT delete a path marked by another op.
    await service.removeWorktreeIfIncomplete(fx.target, wtId, 'token-B');

    expect(existsSync(path)).toBe(true);
    expect(existsSync(sentinel)).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('do-not-delete');
  });

  it('cleans up a partial THIS operation created only when given the matching op token', async () => {
    // A genuine partial owned by this op: wrap the real runner so `git worktree add` simulates git
    // creating the destination then failing mid-checkout. createWorktree writes its ownership
    // marker (CONTENT = this op's token) BEFORE the mutation, so the leftover is provably ours.
    const branch = 'feature/owned-partial';
    const wtId = idForBranch(branch);
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    const real = createGitRunner();
    const runner: GitRunner = {
      run: (a, o) => real.run(a, o),
      capture: (a, o) => {
        if (a.includes('worktree') && a.includes('add')) {
          mkdirSync(path, { recursive: true });
          writeFileSync(join(path, '.partial'), 'half-written');
          return Promise.resolve({ code: 1, stdout: '' });
        }
        return real.capture(a, o);
      },
    };
    const svc = createWorktreeService(fx.ctx, { gitService: fx.gitService, runner });

    await expect(
      svc.createWorktree({ target: fx.target, branch, mode: 'new' }, { token: 'token-A' }),
    ).rejects.toBeInstanceOf(WorktreeError);
    // The failed op left an on-disk partial AND its ownership marker carrying THIS op's token
    // (paired with the claimed dir's fs identity, as JSON).
    expect(existsSync(path)).toBe(true);
    const ownedMarker = JSON.parse(readFileSync(`${path}.pending`, 'utf8')) as { token: string };
    expect(ownedMarker.token).toBe('token-A');

    // Cleanup with a NON-matching token must NOT delete the partial (it is not proven theirs).
    await svc.removeWorktreeIfIncomplete(fx.target, wtId, 'token-WRONG');
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.pending`)).toBe(true);

    // Cleanup with the MATCHING expected token removes the owned partial and clears the marker.
    await svc.removeWorktreeIfIncomplete(fx.target, wtId, 'token-A');
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.pending`)).toBe(false);
  });

  it('never deletes a REPLACEMENT directory whose FS identity differs from the marker, even when the token matches', async () => {
    // FS-safety (identity binding): a matching `<path>.pending` token proves only that THIS op ONCE
    // created a directory at that pathname. If the owned partial is removed and a NEW directory is
    // planted at the same path (e.g. user data) before failure-cleanup runs, the stale token still
    // matches — so authorization MUST additionally require the directory's FS-object identity
    // (dev+ino) to equal the identity the marker recorded at claim time. A replacement object has a
    // different identity → it is NEVER recursively deleted.
    const branch = 'feature/replaced-partial';
    const wtId = idForBranch(branch);
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    const real = createGitRunner();
    const runner: GitRunner = {
      run: (a, o) => real.run(a, o),
      capture: (a, o) => {
        if (a.includes('worktree') && a.includes('add')) {
          // git "partially" populated the (atomically-claimed) dir then failed mid-checkout.
          writeFileSync(join(path, '.partial'), 'half-written');
          return Promise.resolve({ code: 1, stdout: '' });
        }
        return real.capture(a, o);
      },
    };
    const svc = createWorktreeService(fx.ctx, { gitService: fx.gitService, runner });

    await expect(
      svc.createWorktree({ target: fx.target, branch, mode: 'new' }, { token: 'token-A' }),
    ).rejects.toBeInstanceOf(WorktreeError);
    // The op left an owned partial (identity I1) and a marker recording token-A + I1.
    const i1 = lstatSync(path).ino;

    // BEFORE cleanup, the owned partial is removed and REPLACED with a different FS object at the
    // SAME pathname (e.g. a user re-created data there). Build the replacement WHILE the original
    // still occupies its inode, then swap it in, so I2 is deterministically distinct from I1.
    const replacement = `${path}.replacement`;
    mkdirSync(replacement, { recursive: true });
    const sentinel = join(replacement, 'precious.txt');
    writeFileSync(sentinel, 'do-not-delete');
    rmSync(path, { recursive: true, force: true });
    renameSync(replacement, path);
    const sentinelAtPath = join(path, 'precious.txt');
    expect(lstatSync(path).ino).not.toBe(i1); // a genuinely different FS object now lives at the path

    // Cleanup with the MATCHING expected token must NOT delete the replacement: token matches, but
    // the recorded FS identity does not, so authorization is denied — the replacement + sentinel SURVIVE.
    await svc.removeWorktreeIfIncomplete(fx.target, wtId, 'token-A');

    expect(existsSync(path)).toBe(true);
    expect(existsSync(sentinelAtPath)).toBe(true);
    expect(readFileSync(sentinelAtPath, 'utf8')).toBe('do-not-delete');
    // This op's now-stale marker (it pointed at an object that no longer exists) is cleared.
    expect(existsSync(`${path}.pending`)).toBe(false);
  });

  it('releases the ownership marker after a successful create (no lingering claim)', async () => {
    const { wtId } = await service.createWorktree({
      target: fx.target,
      branch: 'feature/clean-marker',
      mode: 'new',
    });
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    expect(existsSync(path)).toBe(true);
    // No lingering ownership claim — a future user-placed directory here is never mistaken for ours.
    expect(existsSync(`${path}.pending`)).toBe(false);
  });

  it('claims the destination ATOMICALLY: a pre-existing dir fails dest-exists and is never marked', async () => {
    // Finding A (TOCTOU): the claim is an exclusive create of the destination directory itself, not
    // an existsSync probe followed by a marker write. A directory this op did not atomically create
    // fails with EEXIST → typed `dest-exists`, and CRUCIALLY no ownership marker is ever planted
    // beside it — so a foreign dir can never be marked "owned" and then deleted by failure cleanup.
    const branch = 'feature/atomic-claim';
    const wtId = idForBranch(branch);
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    const marker = `${path}.pending`;
    mkdirSync(path, { recursive: true });
    const sentinel = join(path, 'precious.txt');
    writeFileSync(sentinel, 'do-not-delete');

    await expect(
      service.createWorktree({ target: fx.target, branch, mode: 'new' }, { token: 'token-this' }),
    ).rejects.toMatchObject({ kind: 'dest-exists' });
    // The atomic claim NEVER marks a directory it did not create.
    expect(existsSync(marker)).toBe(false);

    // Failure-cleanup with this op's own token must leave the unmarked, unowned dir + sentinel intact.
    await service.removeWorktreeIfIncomplete(fx.target, wtId, 'token-this');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('do-not-delete');
  });

  it('refuses to remove a valid-id directory git never registered (force-delete guard)', async () => {
    // Finding B: a NORMAL user directory sits at worktrees/<valid wt-id> — git never managed it as a
    // worktree. The user-delete path forces `git worktree remove`, but must require git-registration
    // BEFORE any filesystem removal: an unmanaged directory is refused with a typed error and never
    // rmSync-ed, even though the wt-id is structurally valid.
    const wtId = idForBranch('feature/not-a-worktree');
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    mkdirSync(path, { recursive: true });
    const sentinel = join(path, 'user-data.txt');
    writeFileSync(sentinel, 'precious-user-data');

    await expect(service.removeWorktree(fx.target, wtId)).rejects.toMatchObject({
      kind: 'dest-not-managed',
    });
    // The unmanaged directory and its contents survive — no rmSync ran.
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('precious-user-data');
  });

  it('removeWorktreeIfIncomplete still cleans an owned partial that git never registered', async () => {
    // The cleanup path must NOT inherit the user-delete registration guard: a genuine partial this
    // op created (atomic-claim + token) is by definition NOT git-registered, yet it must still be
    // removable on failure cleanup. Guards by ownership (token), not by git registration.
    const branch = 'feature/owned-unregistered-partial';
    const wtId = idForBranch(branch);
    const path = join(worktreesDir(fx.ctx, fx.target), wtId);
    const real = createGitRunner();
    const runner: GitRunner = {
      run: (a, o) => real.run(a, o),
      capture: (a, o) => {
        if (a.includes('worktree') && a.includes('add')) {
          // git "partially" populated the (atomically-claimed, empty) dir then failed mid-checkout.
          writeFileSync(join(path, '.partial'), 'half-written');
          return Promise.resolve({ code: 1, stdout: '' });
        }
        return real.capture(a, o);
      },
    };
    const svc = createWorktreeService(fx.ctx, { gitService: fx.gitService, runner });

    await expect(
      svc.createWorktree({ target: fx.target, branch, mode: 'new' }, { token: 'token-A' }),
    ).rejects.toBeInstanceOf(WorktreeError);
    expect(existsSync(path)).toBe(true); // owned partial left on disk

    await svc.removeWorktreeIfIncomplete(fx.target, wtId, 'token-A');
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.pending`)).toBe(false);
  });
});

describe('classifySync (git lamp coarse state)', () => {
  it('maps ahead/behind counts to the sync enum', () => {
    expect(classifySync(0, 0)).toBe('up-to-date');
    expect(classifySync(0, 3)).toBe('ahead');
    expect(classifySync(2, 0)).toBe('behind');
    expect(classifySync(2, 3)).toBe('diverged');
  });
});
