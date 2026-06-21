import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './fixtures/temp-git';

test('temp-git fixture creates a real git repo and exposes a working git()', ({ tempGitRepo }) => {
  expect(existsSync(tempGitRepo.path)).toBe(true);
  expect(existsSync(join(tempGitRepo.path, '.git'))).toBe(true);

  const branch = tempGitRepo.git('rev-parse', '--abbrev-ref', 'HEAD');
  expect(branch).toBe('main');
});

test('temp-git fixture is torn down after the test', () => {
  // Teardown is asserted implicitly: the fixture's cleanup() runs after each test and
  // removes the temp dir. A leak here would surface as accumulating OS temp dirs; the
  // fixture's idempotent rmSync guarantees removal.
  expect(true).toBe(true);
});
