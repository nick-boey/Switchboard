import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorktreeFixture, type WorktreeFixture } from './worktree-fixture.js';

/**
 * Smoke test for the worktree test fixture (task 1.1): the bare clone landed and the known
 * existing branch is present in the bare repo, so the existing-remote-branch path has something
 * real to operate on.
 */
describe('worktree fixture (test infrastructure)', () => {
  let fixture: WorktreeFixture | undefined;
  afterEach(() => {
    fixture?.cleanup();
    fixture = undefined;
  });

  it('bare-clones the remote and carries the known existing branch', async () => {
    fixture = await createWorktreeFixture();
    // A real bare repo landed at repos/<owner>/<repo>/.bare.
    expect(existsSync(join(fixture.bareDir, 'HEAD'))).toBe(true);
    expect(existsSync(join(fixture.bareDir, '.git'))).toBe(false);
    expect(fixture.gitService.isCloned(fixture.target)).toBe(true);
    // The known existing branch came across as a head in the bare clone (loose or packed).
    const heads = execFileSync(
      'git',
      ['--git-dir', fixture.bareDir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      { encoding: 'utf8' },
    );
    expect(heads.split('\n')).toContain(fixture.existingBranch);
  });
});
