import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idForBranch } from '@switchboard/shared';
import { makeServerTestContext } from '../testing/operation-scaffolding.js';
import {
  createWorktreeFixture,
  worktreesDir,
  type WorktreeFixture,
} from '../testing/worktree-fixture.js';
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
});

describe('classifySync (git lamp coarse state)', () => {
  it('maps ahead/behind counts to the sync enum', () => {
    expect(classifySync(0, 0)).toBe('up-to-date');
    expect(classifySync(0, 3)).toBe('ahead');
    expect(classifySync(2, 0)).toBe('behind');
    expect(classifySync(2, 3)).toBe('diverged');
  });
});
