import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempGitRepo, type TempGitRepo } from '@switchboard/shared/testing';
import { makeServerTestContext } from '../testing/operation-scaffolding.js';
import { createGitService, type GitService } from './git-service.js';

/**
 * Failing-first tests for the Git service (task 5.1), with the temp-git fixture as the "remote":
 * a bare clone lands at `~/.switchboard/repos/<owner>/<repo>/.bare` with no working tree;
 * same-named forks don't collide; list-cloned reads completed clones and ignores incomplete
 * targets; out-of-charset/traversal input is rejected before any path is constructed.
 */
describe('Git service — bare clone + list (path safety)', () => {
  let remote: TempGitRepo;
  let service: GitService;
  let workspaceRoot: string;

  beforeEach(() => {
    remote = createTempGitRepo();
    const { ctx } = makeServerTestContext();
    workspaceRoot = ctx.workspaceRoot;
    service = createGitService(ctx);
  });
  afterEach(() => {
    remote.cleanup();
  });

  it('lands a bare clone (no working tree) at the canonical path and lists it', async () => {
    await service.cloneBare({ owner: 'acme', repo: 'widget-factory' }, { remoteUrl: remote.path });
    const bare = join(workspaceRoot, 'repos', 'acme', 'widget-factory', '.bare');
    expect(existsSync(join(bare, 'HEAD'))).toBe(true);
    expect(existsSync(join(bare, 'config'))).toBe(true);
    // Bare: no working tree, no nested `.git` directory, no checked-out index.
    expect(existsSync(join(bare, '.git'))).toBe(false);
    expect(existsSync(join(bare, 'index'))).toBe(false);
    expect(await service.listCloned()).toContainEqual({ owner: 'acme', repo: 'widget-factory' });
    expect(service.isCloned({ owner: 'acme', repo: 'widget-factory' })).toBe(true);
  });

  it('does not collide same-named forks under different owners', async () => {
    await service.cloneBare({ owner: 'alice', repo: 'widget' }, { remoteUrl: remote.path });
    await service.cloneBare({ owner: 'bob', repo: 'widget' }, { remoteUrl: remote.path });
    const cloned = await service.listCloned();
    expect(cloned).toContainEqual({ owner: 'alice', repo: 'widget' });
    expect(cloned).toContainEqual({ owner: 'bob', repo: 'widget' });
  });

  it('list-cloned ignores an incomplete target (no completion marker)', async () => {
    await service.cloneBare({ owner: 'acme', repo: 'done' }, { remoteUrl: remote.path });
    // An interrupted clone left a partial target with no marker.
    mkdirSync(join(workspaceRoot, 'repos', 'acme', 'partial', '.bare'), { recursive: true });
    const cloned = await service.listCloned();
    expect(cloned).toContainEqual({ owner: 'acme', repo: 'done' });
    expect(cloned).not.toContainEqual({ owner: 'acme', repo: 'partial' });
  });

  it('rejects an unsafe owner/repo before constructing any path', async () => {
    await expect(
      service.cloneBare({ owner: '..', repo: 'evil' }, { remoteUrl: remote.path }),
    ).rejects.toThrow();
    // The target is rejected before any path is constructed: no repos tree is created at all.
    expect(existsSync(join(workspaceRoot, 'repos'))).toBe(false);
  });
});
