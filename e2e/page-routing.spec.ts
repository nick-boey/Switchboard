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
 * page-routing E2E (tasks 4.2 / 6.1): the `web-navigation` capability end-to-end against a real
 * `start(ctx)` server (github.com clones redirected to LOCAL source repos via git `insteadOf`, no
 * network) served by `vite preview`. Playwright owns the **real browser-history** assertions
 * (design): the address bar updates on navigation; Back/Forward move between pages — including
 * repo A → repo B → Back → Forward moving the URL *and* the scrolled section between anchors (D7);
 * and a deep-linked `/new-repo` and a cloned repo's `/<owner>/<repo>` load directly, scroll the
 * section into view, and survive a reload (the clean-path / Vite history-fallback behaviour).
 *
 * The injected token is a throwaway test value, not a real secret.
 */

const PREVIEW_ORIGIN = 'http://localhost:4173';
const TOKEN = 'e2e-routing-token-0123456789abcdef';
// Four repos so the deep-link-scroll regression has several PRECEDING sections that grow (each
// renders its own `Worktrees` query after the anchor mounts) — the layout-settling case.
const REPOS = ['acme/widget-factory', 'globex/anvil', 'initech/tps', 'umbrella/corp'] as const;

let remotesRoot: string;
let uiServer: ServerHandle;
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

/** Clone `target` into the server's workspace and wait for it to be ready. */
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
  remotesRoot = mkdtempSync(join(tmpdir(), 'routing-remotes-'));
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

  const ctx = makeTestContext({
    workspaceRoot: mkdtempSync(join(tmpdir(), 'routing-ui-')),
    config: configSchema.parse({
      bearerToken: TOKEN,
      cors: { allowedOrigins: [PREVIEW_ORIGIN] },
    }),
  });
  uiServer = await start(ctx);
  for (const target of REPOS) await cloneRepo(uiServer, target);
});

test.afterAll(async () => {
  await uiServer?.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Hand the page its runtime config (server URL + bearer token) before any app code runs, then go. */
async function openAt(page: Page, path: string): Promise<void> {
  await page.addInitScript(
    (config) => {
      (window as unknown as { __SWITCHBOARD_CONFIG__?: unknown }).__SWITCHBOARD_CONFIG__ = config;
    },
    { serverUrl: uiServer.url, bearerToken: TOKEN },
  );
  await page.goto(path);
  await expect(page.getByTestId('app-shell')).toBeVisible();
}

test('the address bar updates on navigation and Back/Forward move between pages', async ({
  page,
}) => {
  await openAt(page, '/');
  await expect(page).toHaveURL(/\/$/);

  // Navigating to New repository updates the address bar and swaps the main content.
  await page.getByTestId('nav-new-repository').click();
  await expect(page).toHaveURL(/\/new-repo$/);
  await expect(page.getByTestId('new-repository')).toBeVisible();

  // Back returns to the home; Forward returns to New repository.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('repos-home')).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/new-repo$/);
  await expect(page.getByTestId('new-repository')).toBeVisible();
});

test('a repository deep-link loads directly, scrolls to its section, and survives a reload', async ({
  page,
}) => {
  // Direct load of a clean deep-link path (exercises the Vite history fallback).
  await openAt(page, '/globex/anvil');
  await expect(page).toHaveURL(/\/globex\/anvil$/);
  await expect(page.locator('[id="repo:globex/anvil"]')).toBeInViewport();

  // The page (and its scrolled section) survives a reload.
  await page.reload();
  await expect(page).toHaveURL(/\/globex\/anvil$/);
  await expect(page.locator('[id="repo:globex/anvil"]')).toBeInViewport();
});

test('Back and Forward move the URL and scrolled section between two repository anchors', async ({
  page,
}) => {
  await openAt(page, '/');

  await page.getByTestId('nav-repo:acme/widget-factory').click();
  await expect(page).toHaveURL(/\/acme\/widget-factory$/);
  await expect(page.locator('[id="repo:acme/widget-factory"]')).toBeInViewport();
  // The sidebar marks exactly the current repository active (web-navigation active-nav scenario).
  await expect(page.getByTestId('nav-repo:acme/widget-factory')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.getByTestId('nav-repo:globex/anvil')).not.toHaveAttribute(
    'data-active',
    'true',
  );

  await page.getByTestId('nav-repo:globex/anvil').click();
  await expect(page).toHaveURL(/\/globex\/anvil$/);
  await expect(page.locator('[id="repo:globex/anvil"]')).toBeInViewport();
  // Active mark moves to the new repository.
  await expect(page.getByTestId('nav-repo:globex/anvil')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('nav-repo:acme/widget-factory')).not.toHaveAttribute(
    'data-active',
    'true',
  );

  // Back to repo A: URL and scrolled section both return to acme.
  await page.goBack();
  await expect(page).toHaveURL(/\/acme\/widget-factory$/);
  await expect(page.locator('[id="repo:acme/widget-factory"]')).toBeInViewport();

  // Forward to repo B: URL and scrolled section both return to globex.
  await page.goForward();
  await expect(page).toHaveURL(/\/globex\/anvil$/);
  await expect(page.locator('[id="repo:globex/anvil"]')).toBeInViewport();
});

test('a deep-link stays scrolled to its section as preceding sections grow', async ({ page }) => {
  // The layout-settling case from the implementation review. A short viewport makes the page
  // scrollable; deep-link to a NON-first repo with sections both above (which grow as their
  // `Worktrees` query resolves AFTER the cloned-repos list, pushing the target down) and below
  // (so the target *can* reach the top). A single scroll would leave the target drifted down; the
  // re-pin must keep it near the top once the layout settles.
  await page.setViewportSize({ width: 1280, height: 400 });
  const TARGET = REPOS[1]; // a middle repo: section above grows; sections below give scroll room
  await openAt(page, `/${TARGET}`);
  await expect(page).toHaveURL(new RegExp(`/${TARGET}$`));

  // Wait for every repository's inline Worktrees to finish mounting (all sections at final height).
  await expect(page.getByTestId('worktrees')).toHaveCount(REPOS.length);

  // The target is not just on-screen but scrolled near the top — proving it was re-pinned through
  // the preceding section's growth, not pushed down by it (a single un-pinned scroll lands it lower).
  const target = page.locator(`[id="repo:${TARGET}"]`);
  await expect(target).toBeInViewport();
  await expect
    .poll(async () => (await target.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
    .toBeLessThan(150);
});
