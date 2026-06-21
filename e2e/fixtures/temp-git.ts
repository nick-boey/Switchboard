import { test as base, expect } from '@playwright/test';
import { createTempGitRepo, type TempGitRepo } from '@switchboard/shared/testing';

/**
 * Playwright fixture wrapping the shared temp-git helper: a fresh git repo per test, torn
 * down automatically on teardown. Required by later changes (repo clone/browse, etc.).
 */
export const test = base.extend<{ tempGitRepo: TempGitRepo }>({
  tempGitRepo: async ({}, use) => {
    const repo = createTempGitRepo();
    await use(repo);
    repo.cleanup();
  },
});

export { expect };
