import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import type { ServerHandle } from '@switchboard/shared';
// Boot the ALREADY-BUILT server (group 6 requires `just build`).
import { start } from '../apps/server/dist/index.js';

/**
 * repos-home-and-sidebar E2E (task 6.1): the aggregated repositories home over the real `ReposHome`
 * container against a `start(ctx)` server, with github.com clones redirected to LOCAL source repos
 * via git `insteadOf` (no network). Covers: repositories cloned across organisations render grouped
 * on one page with worktrees inline; a sidebar repo deep-link reveals that repository's section; and
 * the zero-repository home's "Clone a repository" CTA opens the new-repository flow.
 *
 * The injected token is a throwaway test value, not a real secret.
 */

const PREVIEW_ORIGIN = 'http://localhost:4173';
const TOKEN = 'e2e-home-token-0123456789abcdef';
const REPOS = ['acme/widget-factory', 'globex/anvil'] as const;

let remotesRoot: string;
let uiServer: ServerHandle;
let emptyServer: ServerHandle;
const savedEnv: Record<string, string | undefined> = {};

/** A local source repo with a single `main` commit (the clone source behind `insteadOf`). */
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

/** Clone `target` into a server's workspace and wait for it to be ready. */
async function cloneRepo(server: ServerHandle, target: string): Promise<void> {
  await api(server, '/repos/clone', { target });
  for (let i = 0; i < 100; i += 1) {
    const res = await api(server, `/repos/${target}/status`);
    if (res.ok) {
      const body = (await res.json()) as { status: string };
      if (body.status === 'ready') return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`clone ${target} did not become ready`);
}

test.beforeAll(async () => {
  remotesRoot = mkdtempSync(join(tmpdir(), 'home-remotes-'));
  for (const target of REPOS) initSourceRepo(join(remotesRoot, `${target}.git`));

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

  uiServer = await bootServer(mkdtempSync(join(tmpdir(), 'home-ui-')));
  for (const target of REPOS) await cloneRepo(uiServer, target);

  // A second, isolated workspace with nothing cloned — for the empty-home flow.
  emptyServer = await bootServer(mkdtempSync(join(tmpdir(), 'home-empty-')));
});

test.afterAll(async () => {
  await uiServer?.close();
  await emptyServer?.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function openHome(page: Page, server: ServerHandle): Promise<void> {
  await page.addInitScript(
    (config) => {
      (window as unknown as { __SWITCHBOARD_CONFIG__?: unknown }).__SWITCHBOARD_CONFIG__ = config;
    },
    { serverUrl: server.url, bearerToken: TOKEN },
  );
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
}

test('shows every cloned repository grouped on one page with worktrees inline', async ({
  page,
}) => {
  await openHome(page, uiServer);

  // Both organisations' sections render on the one page, each with its inline Worktrees.
  for (const target of REPOS) {
    await expect(page.locator(`[id="repo:${target}"]`)).toBeVisible();
  }
  await expect(page.getByTestId('worktrees')).toHaveCount(REPOS.length);

  // The sidebar lists both repositories under their organisation subheadings.
  await expect(page.getByTestId('nav-org:acme')).toBeVisible();
  await expect(page.getByTestId('nav-org:globex')).toBeVisible();
  for (const target of REPOS) {
    await expect(page.getByTestId(`nav-repo:${target}`)).toBeVisible();
  }

  // Activating a sidebar repo link reveals that repository's section.
  await page.getByTestId('nav-repo:globex/anvil').click();
  await expect(page.locator('[id="repo:globex/anvil"]')).toBeInViewport();
});

test('the empty-home clone CTA opens the new-repository flow', async ({ page }) => {
  await openHome(page, emptyServer);

  await expect(page.getByTestId('repos-home-empty')).toBeVisible();
  await page.getByTestId('repos-home-clone').click();
  await expect(page.getByTestId('new-repository')).toBeVisible();
});
