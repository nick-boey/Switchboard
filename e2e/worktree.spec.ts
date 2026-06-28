import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema, idForBranch } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import type { ServerHandle } from '@switchboard/shared';
// Boot the ALREADY-BUILT server (group 8 requires `just build`).
import { start } from '../apps/server/dist/index.js';

/**
 * worktree-management E2E (group 8): the worktrees hub create / list / delete flow against a real
 * `start(ctx)` server, with github.com clones redirected to LOCAL source repos via git `insteadOf`
 * (no network). The UI covers new-branch + adversarial-branch create → it appears with its branch
 * + git lamp, and delete-via-confirmation → it disappears while the bare clone survives. The
 * ledger/lock + safe-to-delete invariants (existing-remote create, un-forced refusal, idempotent
 * duplicate create, restart recovery) are asserted deterministically at the API.
 */

const PREVIEW_ORIGIN = 'http://localhost:4173';
const TOKEN = 'e2e-wt-token-0123456789abcdef';
const REPO = 'acme/widget-factory';
const EXISTING_BRANCH = 'existing-feature';

let remotesRoot: string;
let uiServer: ServerHandle;
let uiRoot: string;
const savedEnv: Record<string, string | undefined> = {};

/** A local source repo with `main` + a known existing branch (the existing-remote path). */
function initSourceRepo(path: string): void {
  mkdirSync(path, { recursive: true });
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', path, ...args], { stdio: 'ignore' });
  };
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'e2e@switchboard.local');
  git('config', 'user.name', 'E2E');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(path, 'README.md'), '# e2e source\n');
  git('add', '.');
  git('commit', '--quiet', '--message', 'init');
  git('branch', EXISTING_BRANCH);
}

function api(server: ServerHandle, path: string, body?: unknown) {
  return fetch(`${server.url}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function bootServer(root: string): Promise<ServerHandle> {
  const ctx = makeTestContext({
    workspaceRoot: root,
    config: configSchema.parse({
      bearerToken: TOKEN,
      cors: { allowedOrigins: [PREVIEW_ORIGIN] },
    }),
  });
  return start(ctx);
}

/** Clone REPO into a server's workspace and wait for it to be ready. */
async function cloneRepo(server: ServerHandle): Promise<void> {
  await api(server, '/repos/clone', { target: REPO });
  for (let i = 0; i < 100; i += 1) {
    const res = await api(server, `/repos/${REPO}/status`);
    if (res.ok) {
      const body = (await res.json()) as { status: string };
      if (body.status === 'ready') return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('clone did not become ready');
}

test.beforeAll(async () => {
  remotesRoot = mkdtempSync(join(tmpdir(), 'wt-remotes-'));
  initSourceRepo(join(remotesRoot, 'acme', 'widget-factory.git'));

  const gitconfig = join(remotesRoot, '.gitconfig');
  writeFileSync(
    gitconfig,
    [`[url "${remotesRoot}/"]`, `\tinsteadOf = https://github.com/`, ''].join('\n'),
  );
  for (const key of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_ALLOW_PROTOCOL']) {
    savedEnv[key] = process.env[key];
  }
  process.env.GIT_CONFIG_GLOBAL = gitconfig;
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
  process.env.GIT_ALLOW_PROTOCOL = 'file:https';

  uiRoot = mkdtempSync(join(tmpdir(), 'wt-ui-'));
  uiServer = await bootServer(uiRoot);
  await cloneRepo(uiServer);
});

test.afterAll(async () => {
  await uiServer?.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function openHubRepo(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    (config) => {
      (window as unknown as { __SWITCHBOARD_CONFIG__?: unknown }).__SWITCHBOARD_CONFIG__ = config;
    },
    { serverUrl: uiServer.url, bearerToken: TOKEN },
  );
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  // Worktrees are shown inline on the repositories home — acme/widget-factory's section renders its
  // Worktrees directly, with no master-detail repo-selection step.
  await expect(page.getByTestId('worktrees')).toBeVisible();
}

async function createNewBranchWorktree(
  page: import('@playwright/test').Page,
  branch: string,
): Promise<void> {
  await page.getByTestId('wt-add').click();
  await expect(page.getByTestId('create-worktree-modal')).toBeVisible();
  await page.getByTestId('wt-branch-input').fill(branch);
  await page.getByTestId('wt-create-button').click();
  await expect(page.getByText(branch, { exact: true })).toBeVisible({ timeout: 20_000 });
}

test('creates a new-branch worktree via the modal → it appears with its branch + git lamp', async ({
  page,
}) => {
  await openHubRepo(page);
  const branch = 'feature/new-from-ui';
  await createNewBranchWorktree(page, branch);

  const wtId = idForBranch(branch);
  await expect(page.getByTestId(`wt-row-${wtId}`)).toBeVisible();
  // The git lamp (display-only) is present for the row.
  await expect(page.getByTestId(`wt-git-${wtId}`)).toBeVisible();
  // The worktree checkout landed at the canonical on-disk path.
  expect(existsSync(join(uiRoot, 'repos', 'acme', 'widget-factory', 'worktrees', wtId))).toBe(true);
});

test('creates an adversarial-branch worktree → a valid wt-id directory + correct mapping', async ({
  page,
}) => {
  await openHubRepo(page);
  const branch = 'feature/foo';
  await createNewBranchWorktree(page, branch);

  const wtId = idForBranch(branch);
  // The path-safe id contains no slash and lands at its own directory.
  expect(wtId).not.toContain('/');
  expect(existsSync(join(uiRoot, 'repos', 'acme', 'widget-factory', 'worktrees', wtId))).toBe(true);
  await expect(page.getByTestId(`wt-row-${wtId}`)).toBeVisible();
});

test('deletes a worktree via confirmation → it disappears and the bare clone survives', async ({
  page,
}) => {
  await openHubRepo(page);
  const branch = 'fix/to-delete';
  await createNewBranchWorktree(page, branch);
  const wtId = idForBranch(branch);

  await page.getByTestId(`wt-delete-${wtId}`).click();
  await expect(page.getByTestId('wt-confirm-delete')).toBeVisible();
  await page.getByTestId('wt-confirm-remove').click();

  await expect(page.getByTestId(`wt-row-${wtId}`)).toHaveCount(0, { timeout: 20_000 });
  // Only the checkout was removed: the bare clone survives, the worktree dir is gone.
  expect(existsSync(join(uiRoot, 'repos', 'acme', 'widget-factory', '.bare', 'HEAD'))).toBe(true);
  expect(existsSync(join(uiRoot, 'repos', 'acme', 'widget-factory', 'worktrees', wtId))).toBe(
    false,
  );
});

test('cancelling the delete confirmation keeps the worktree', async ({ page }) => {
  await openHubRepo(page);
  const branch = 'fix/keep-me';
  await createNewBranchWorktree(page, branch);
  const wtId = idForBranch(branch);

  await page.getByTestId(`wt-delete-${wtId}`).click();
  await expect(page.getByTestId('wt-confirm-delete')).toBeVisible();
  await page.getByTestId('wt-confirm-cancel').click();
  await expect(page.getByTestId(`wt-row-${wtId}`)).toBeVisible();
});

// --- API-level invariants (deterministic) ----------------------------------

async function createViaApi(server: ServerHandle, branch: string, mode: string): Promise<string> {
  const res = await api(server, '/worktrees/create', { repoId: REPO, branch, mode });
  const body = (await res.json()) as { repoId: string };
  // Wait for the worktree to be listed.
  for (let i = 0; i < 100; i += 1) {
    const list = await api(server, `/worktrees/${REPO}`);
    if (list.ok) {
      const data = (await list.json()) as { worktrees: { wtId: string; branch: string }[] };
      const found = data.worktrees.find((w) => w.branch === branch);
      if (found) return found.wtId;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`worktree for ${branch} never listed (op key ${body.repoId})`);
}

test('existing-remote create lands a worktree on the existing branch', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wt-api-'));
  const server = await bootServer(root);
  try {
    await cloneRepo(server);
    const wtId = await createViaApi(server, EXISTING_BRANCH, 'existing-remote');
    expect(wtId).toBe(idForBranch(EXISTING_BRANCH));
    expect(existsSync(join(root, 'repos', 'acme', 'widget-factory', 'worktrees', wtId))).toBe(true);
  } finally {
    await server.close();
  }
});

test('un-forced delete is refused (not-safe), forced delete succeeds', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wt-api-'));
  const server = await bootServer(root);
  try {
    await cloneRepo(server);
    const wtId = await createViaApi(server, 'feature/guarded', 'new');

    // No PR-merged source in the MVP → not auto-safe → un-forced delete refused.
    const refused = await api(server, '/worktrees/delete', { repoId: REPO, wtId }).then((r) =>
      r.json(),
    );
    expect(refused).toMatchObject({ status: 'not-safe' });
    expect(existsSync(join(root, 'repos', 'acme', 'widget-factory', 'worktrees', wtId))).toBe(true);

    // The confirmation/force path proceeds.
    const ok = await api(server, '/worktrees/delete', { repoId: REPO, wtId, force: true }).then(
      (r) => r.json(),
    );
    expect(ok).toMatchObject({ status: 'deleted' });
    expect(existsSync(join(root, 'repos', 'acme', 'widget-factory', 'worktrees', wtId))).toBe(
      false,
    );
  } finally {
    await server.close();
  }
});

test('concurrent duplicate creates for the same worktree are idempotent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wt-api-'));
  const server = await bootServer(root);
  try {
    await cloneRepo(server);
    const [a, b] = await Promise.all([
      api(server, '/worktrees/create', { repoId: REPO, branch: 'feature/dup', mode: 'new' }).then(
        (r) => r.json(),
      ),
      api(server, '/worktrees/create', { repoId: REPO, branch: 'feature/dup', mode: 'new' }).then(
        (r) => r.json(),
      ),
    ]);
    expect(a.operationId).toBe(b.operationId);
  } finally {
    await server.close();
  }
});

test('restart reconciles a stale running worktree op to a failed state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wt-api-'));
  mkdirSync(join(root, 'operations'), { recursive: true });
  const wtId = idForBranch('feature/stale');
  const key = `${REPO}/${wtId}`;
  writeFileSync(
    join(root, 'operations', `${encodeURIComponent(key)}.json`),
    JSON.stringify({
      id: 'stale',
      type: 'worktree',
      key,
      state: 'running',
      startedAt: 1,
      pid: 2_147_483_646, // an impossible pid → not alive
      metadata: { branch: 'feature/stale' },
    }),
  );
  const server = await bootServer(root); // start() runs reconcile on boot
  try {
    const status = await api(server, `/worktrees/${REPO}/${wtId}/status`).then((r) => r.json());
    expect(status.status).toBe('error');
  } finally {
    await server.close();
  }
});
