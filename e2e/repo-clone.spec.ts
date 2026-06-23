import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema } from '@switchboard/shared';
import { createFakeGitHub, makeTestContext, type FakeGitHub } from '@switchboard/shared/testing';
import type { ServerHandle } from '@switchboard/shared';
// Boot the ALREADY-BUILT server (group 9 requires `just build`).
import { start } from '../apps/server/dist/index.js';

/**
 * Repo-clone-browse E2E (group 9). Drives the real New repository → clone → getting-ready flow
 * against a `start(ctx)` server, with:
 * - a fake GitHub REST server backing the repo-list (owners + repos), and
 * - github.com clone URLs redirected to LOCAL source repos via git `insteadOf` (no network),
 *   plus an `ext::` slow transport for one repo so an in-flight clone can be aborted.
 *
 * The UI covers both the organisation owner-selector and From-URL `.git` happy paths, the abort
 * action, and the error state; the ledger/lock invariants (idempotency, completion-wins abort
 * without deleting a completed clone, restart recovery) are asserted deterministically at the API.
 */

const PREVIEW_ORIGIN = 'http://localhost:4173';
const TOKEN = 'e2e-bearer-token-0123456789abcdef';
const PAT = 'ghp_e2e_pat_value';

let remotesRoot: string;
let fake: FakeGitHub;
let fakeServer: { url: string; close: () => Promise<void> };
let uiServer: ServerHandle;
let uiRoot: string;
const savedEnv: Record<string, string | undefined> = {};

/** Initialize a local source git repo (with one commit) at `path`. */
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

async function bootServer(root: string, withGithub: boolean): Promise<ServerHandle> {
  const ctx = makeTestContext({
    workspaceRoot: root,
    config: configSchema.parse({
      bearerToken: TOKEN,
      cors: { allowedOrigins: [PREVIEW_ORIGIN] },
      github: withGithub ? { token: PAT, apiBaseUrl: fakeServer.url } : null,
    }),
  });
  return start(ctx);
}

test.beforeAll(async () => {
  remotesRoot = mkdtempSync(join(tmpdir(), 'rcb-remotes-'));
  // Local source repos github.com URLs redirect to.
  initSourceRepo(join(remotesRoot, 'acme', 'widget-factory.git'));
  initSourceRepo(join(remotesRoot, 'nick-boey', 'switchboard.git'));

  // A slow `ext::` transport so an in-flight clone stays cloneable long enough to abort.
  const slowScript = join(remotesRoot, 'slow-upload-pack.sh');
  writeFileSync(
    slowScript,
    ['#!/bin/sh', 'sleep "${SLOW_SECONDS:-5}"', 'exec git-upload-pack "$SLOW_REPO"', ''].join('\n'),
    { mode: 0o755 },
  );

  // git config redirecting github.com → local; a more-specific rule sends acme/slow.git to the
  // slow transport. Scoped via GIT_CONFIG_GLOBAL so the developer's real config is untouched.
  const gitconfig = join(remotesRoot, '.gitconfig');
  writeFileSync(
    gitconfig,
    [
      `[url "${remotesRoot}/"]`,
      `\tinsteadOf = https://github.com/`,
      `[url "ext::sh ${slowScript}"]`,
      `\tinsteadOf = https://github.com/acme/slow.git`,
      '',
    ].join('\n'),
  );

  for (const key of [
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_SYSTEM',
    'GIT_ALLOW_PROTOCOL',
    'SLOW_REPO',
    'SLOW_SECONDS',
  ]) {
    savedEnv[key] = process.env[key];
  }
  process.env.GIT_CONFIG_GLOBAL = gitconfig;
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
  process.env.GIT_ALLOW_PROTOCOL = 'file:ext:https';
  process.env.SLOW_REPO = join(remotesRoot, 'acme', 'widget-factory.git');
  process.env.SLOW_SECONDS = '5';

  fake = createFakeGitHub({
    login: 'nick-boey',
    organisations: ['acme'],
    repositories: [
      { owner: 'nick-boey', name: 'switchboard' },
      { owner: 'acme', name: 'widget-factory' },
    ],
    token: PAT,
  });
  fakeServer = await fake.listen();

  uiRoot = mkdtempSync(join(tmpdir(), 'rcb-ui-'));
  uiServer = await bootServer(uiRoot, true);
});

test.afterAll(async () => {
  await uiServer?.close();
  await fakeServer?.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function openNewRepository(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    (config) => {
      (window as unknown as { __SWITCHBOARD_CONFIG__?: unknown }).__SWITCHBOARD_CONFIG__ = config;
    },
    { serverUrl: uiServer.url, bearerToken: TOKEN },
  );
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('nav-new-repository').click();
  await expect(page.getByTestId('new-repository')).toBeVisible();
}

test('clones an organisation repository via the owner selector → ready', async ({ page }) => {
  await openNewRepository(page);
  // Wait for the repo-list to resolve (the Select/From URL toggle appears once `ok`).
  await expect(page.getByTestId('method-toggle')).toBeVisible();

  await page.getByTestId('owner-input').fill('acme');
  await page.getByTestId('repo-input').fill('widget-factory');
  await page.keyboard.press('Escape'); // close the autocomplete dropdown
  await page.getByTestId('clone-button').click();

  await expect(page.getByTestId('repo-ready')).toBeVisible({ timeout: 20_000 });
});

test('clones a personal repository From URL with a .git suffix → ready', async ({ page }) => {
  await openNewRepository(page);
  await expect(page.getByTestId('method-toggle')).toBeVisible();
  await page.getByRole('button', { name: 'From URL' }).click();

  await page.getByTestId('url-input').fill('https://github.com/nick-boey/switchboard.git');
  // Preview normalizes the .git away.
  await expect(page.getByTestId('repo-preview')).toContainText('nick-boey/switchboard');
  await page.getByTestId('clone-button').click();

  await expect(page.getByTestId('repo-ready')).toBeVisible({ timeout: 20_000 });
});

test('aborts an in-flight clone → aborted state', async ({ page }) => {
  await openNewRepository(page);
  await expect(page.getByTestId('method-toggle')).toBeVisible();
  await page.getByRole('button', { name: 'From URL' }).click();

  // `acme/slow` maps to the slow ext transport, so the clone stays in-flight.
  await page.getByTestId('url-input').fill('https://github.com/acme/slow');
  await page.getByTestId('clone-button').click();

  await expect(page.getByTestId('clone-abort')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('clone-abort').click();
  await expect(page.getByTestId('clone-aborted')).toBeVisible({ timeout: 20_000 });
});

test('retry from a terminal state resumes polling and reaches ready', async ({ page }) => {
  // Regression for the impl-review finding: after a clone reaches a terminal state (here aborted),
  // a SAME-repo Retry must re-enable status polling so the screen progresses cloning→ready. The
  // bug left the `['clone-status', repoId]` query pinned to the terminal value (refetchInterval
  // false), so the user stayed on the stale terminal screen forever.
  test.setTimeout(60_000);
  await openNewRepository(page);
  await expect(page.getByTestId('method-toggle')).toBeVisible();
  await page.getByRole('button', { name: 'From URL' }).click();

  // `acme/slow` maps to the slow ext transport, so the first clone stays in-flight long enough to
  // abort it into a terminal state.
  await page.getByTestId('url-input').fill('https://github.com/acme/slow');
  await page.getByTestId('clone-button').click();
  await expect(page.getByTestId('clone-abort')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('clone-abort').click();
  await expect(page.getByTestId('clone-aborted')).toBeVisible({ timeout: 20_000 });

  // Retry the SAME repo: a fresh server-side clone starts, and the screen must resume polling.
  await page.getByTestId('clone-retry').click();
  // Polling resumed: we are back in the in-flight (cloning) state, not stuck on aborted.
  await expect(page.getByTestId('cloning-indicator')).toBeVisible({ timeout: 20_000 });
  // And it progresses all the way to ready (the slow transport completes after a few seconds).
  await expect(page.getByTestId('repo-ready')).toBeVisible({ timeout: 30_000 });
});

test('shows the error state when a clone fails', async ({ page }) => {
  await openNewRepository(page);
  await expect(page.getByTestId('method-toggle')).toBeVisible();
  await page.getByRole('button', { name: 'From URL' }).click();

  // No local source exists for this repo → the clone fails → error state.
  await page.getByTestId('url-input').fill('https://github.com/acme/missing');
  await page.getByTestId('clone-button').click();

  await expect(page.getByTestId('clone-error-message')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('clone-retry')).toBeVisible();
});

// --- API-level ledger/lock invariants (deterministic) ----------------------

function api(server: ServerHandle, path: string, body?: unknown) {
  return fetch(`${server.url}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function pollUntil(
  server: ServerHandle,
  repoId: string,
  predicate: (status: string) => boolean,
): Promise<{ status: string }> {
  for (let i = 0; i < 100; i += 1) {
    const res = await api(server, `/repos/${repoId}/status`);
    if (res.ok) {
      const body = (await res.json()) as { status: string };
      if (predicate(body.status)) return body;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting on ${repoId}`);
}

test('concurrent clone requests for the same repo are idempotent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rcb-api-'));
  const server = await bootServer(root, false);
  try {
    const [a, b] = await Promise.all([
      api(server, '/repos/clone', { target: 'acme/widget-factory' }).then((r) => r.json()),
      api(server, '/repos/clone', { target: 'acme/widget-factory' }).then((r) => r.json()),
    ]);
    expect(a.operationId).toBe(b.operationId);
    await pollUntil(server, 'acme/widget-factory', (s) => s === 'ready');
  } finally {
    await server.close();
  }
});

test('aborting after completion reports ready and does not delete the clone', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rcb-api-'));
  const server = await bootServer(root, false);
  try {
    await api(server, '/repos/clone', { target: 'acme/widget-factory' });
    await pollUntil(server, 'acme/widget-factory', (s) => s === 'ready');

    const aborted = await api(server, '/repos/abort', { repoId: 'acme/widget-factory' }).then((r) =>
      r.json(),
    );
    expect(aborted.status).toBe('ready');
    expect(existsSync(join(root, 'repos', 'acme', 'widget-factory', '.bare', 'HEAD'))).toBe(true);
  } finally {
    await server.close();
  }
});

test('restart reconciles a stale running clone to a failed state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rcb-api-'));
  mkdirSync(join(root, 'operations'), { recursive: true });
  writeFileSync(
    join(root, 'operations', `${encodeURIComponent('acme/widget-factory')}.json`),
    JSON.stringify({
      id: 'stale',
      type: 'clone',
      key: 'acme/widget-factory',
      state: 'running',
      startedAt: 1,
      pid: 2_147_483_646, // an impossible pid → not alive
    }),
  );
  const server = await bootServer(root, false); // start() runs reconcile on boot
  try {
    const status = await api(server, '/repos/acme/widget-factory/status').then((r) => r.json());
    expect(status.status).toBe('error');
  } finally {
    await server.close();
  }
});
