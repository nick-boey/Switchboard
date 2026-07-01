// Test-only helpers, exposed at `@switchboard/shared/testing` (kept out of the runtime
// entrypoint). Imported by unit tests and Playwright e2e fixtures across the workspace.
export { makeTestContext } from './runtime-context.js';
export { createTempGitRepo } from './temp-git.js';
export type { TempGitRepo } from './temp-git.js';
export { makeWebBundleFixture } from './web-bundle.js';
export type { WebBundleFixture } from './web-bundle.js';
export { createFakeGitHub } from './github-fake.js';
export type {
  FakeGitHub,
  FakeGitHubFailure,
  FakeGitHubFixtures,
  FakeGitHubRepo,
} from './github-fake.js';
