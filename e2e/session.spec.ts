import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema, idForBranch } from '@switchboard/shared';
import { makeTestContext } from '@switchboard/shared/testing';
import type { ServerHandle } from '@switchboard/shared';
// Boot the ALREADY-BUILT server (group 11 requires `just build`).
import { start, type TmuxRunner } from '../apps/server/dist/index.js';

/**
 * claude-session-launch E2E (group 11): the session plug on/off round-trip + the session-liveness
 * seam, against a real `start(ctx)` server with a **faked tmux boundary** (no real `claude` login in
 * CI). github.com clones are redirected to LOCAL source repos via git `insteadOf` (no network). The
 * UI drives the plug off→on→off on the worktrees hub; the API-level test proves launch → the session
 * is listed `on` → a non-force delete is refused (the live-session seam) → stop → `off`.
 */

const PREVIEW_ORIGIN = 'http://localhost:4173';
const TOKEN = 'e2e-session-token-0123456789abcdef';
const REPO = 'acme/widget-factory';

let remotesRoot: string;
let uiServer: ServerHandle;
let uiRoot: string;
let uiTmux: ReturnType<typeof makeFakeTmux>;
const savedEnv: Record<string, string | undefined> = {};

/** A controllable in-memory fake tmux boundary — no real `claude` / tmux needed in CI. */
function makeFakeTmux(): { runner: TmuxRunner; live: Set<string> } {
  const live = new Set<string>();
  const runner: TmuxRunner = {
    async newSession(name: string, _cwd: string, _command: string[]) {
      live.add(name);
    },
    async hasSession(name: string) {
      return live.has(name);
    },
    async listSessions() {
      return [...live];
    },
    async killSession(name: string) {
      live.delete(name);
    },
  };
  return { runner, live };
}

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

async function bootServer(root: string, tmuxRunner: TmuxRunner): Promise<ServerHandle> {
  const ctx = makeTestContext({
    workspaceRoot: root,
    config: configSchema.parse({
      bearerToken: TOKEN,
      cors: { allowedOrigins: [PREVIEW_ORIGIN] },
    }),
  });
  return start(ctx, { sessions: { tmuxRunner } });
}

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

async function createViaApi(server: ServerHandle, branch: string): Promise<string> {
  await api(server, '/worktrees/create', { repoId: REPO, branch, mode: 'new' });
  for (let i = 0; i < 100; i += 1) {
    const list = await api(server, `/worktrees/${REPO}`);
    if (list.ok) {
      const data = (await list.json()) as { worktrees: { wtId: string; branch: string }[] };
      const found = data.worktrees.find((w) => w.branch === branch);
      if (found) return found.wtId;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`worktree for ${branch} never listed`);
}

async function waitForSession(server: ServerHandle, wtId: string, present: boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    const res = await api(server, `/sessions/${REPO}`);
    if (res.ok) {
      const data = (await res.json()) as { sessions: { wtId: string }[] };
      const found = data.sessions.some((s) => s.wtId === wtId);
      if (found === present) return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`session for ${wtId} never became ${present ? 'live' : 'absent'}`);
}

test.beforeAll(async () => {
  remotesRoot = mkdtempSync(join(tmpdir(), 'sess-remotes-'));
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

  uiRoot = mkdtempSync(join(tmpdir(), 'sess-ui-'));
  uiTmux = makeFakeTmux();
  uiServer = await bootServer(uiRoot, uiTmux.runner);
  await cloneRepo(uiServer);
});

test.afterAll(async () => {
  await uiServer?.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function openHubRepo(
  page: import('@playwright/test').Page,
  server: ServerHandle = uiServer,
): Promise<void> {
  await page.addInitScript(
    (config) => {
      (window as unknown as { __SWITCHBOARD_CONFIG__?: unknown }).__SWITCHBOARD_CONFIG__ = config;
    },
    { serverUrl: server.url, bearerToken: TOKEN },
  );
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('nav-worktrees').click();
  await expect(page.getByTestId('worktrees-hub')).toBeVisible();
  await page.getByTestId('wt-hub-repo-acme-widget-factory').click();
  await expect(page.getByTestId('worktrees')).toBeVisible();
}

test('the plug launches then stops a session on the worktrees hub (on/off round-trip)', async ({
  page,
}) => {
  await openHubRepo(page);
  const branch = 'feature/plug-roundtrip';
  await page.getByTestId('wt-add').click();
  await expect(page.getByTestId('create-worktree-modal')).toBeVisible();
  await page.getByTestId('wt-branch-input').fill(branch);
  await page.getByTestId('wt-create-button').click();
  const wtId = idForBranch(branch);
  const plug = page.getByTestId(`wt-plug-${wtId}`);
  await expect(plug).toBeVisible({ timeout: 20_000 });

  // Off → activate → launch → the plug reads on (running) once liveness re-derives from tmux.
  await expect(plug).toHaveAttribute('data-status', 'off');
  await plug.click();
  await expect(plug).toHaveAttribute('data-status', 'running', { timeout: 15_000 });

  // No standalone session screen and no mobile-app handoff toast appear (Gate #1 + #2).
  await expect(page.getByTestId('session-handoff')).toHaveCount(0);
  await expect(page.getByTestId('sessions-list')).toHaveCount(0);

  // On → activate → stop → the plug reads off again.
  await plug.click();
  await expect(plug).toHaveAttribute('data-status', 'off', { timeout: 15_000 });
});

test('an asynchronous launch failure surfaces the plug error state (not off)', async ({ page }) => {
  // Boots a dedicated server and clones in-test (like the seam test below); give it headroom over
  // the default 30s so a real git clone under full-suite CPU contention does not time out.
  test.setTimeout(90_000);
  // The launch POST resolves the moment the ledger records a running worker (status `starting`), so
  // an async tmux/`claude` failure lands AFTER the POST. The plug must POLL the launch op and read
  // `error`, never silently fall back to liveness-only `off`. A fake tmux whose `newSession` rejects
  // (and which never reports a live session) reproduces the failed launch.
  const root = mkdtempSync(join(tmpdir(), 'sess-ui-fail-'));
  const failingTmux: TmuxRunner = {
    async newSession() {
      throw new Error('claude failed to start');
    },
    async hasSession() {
      return false;
    },
    async listSessions() {
      return [];
    },
    async killSession() {},
  };
  const server = await bootServer(root, failingTmux);
  try {
    await cloneRepo(server);
    await openHubRepo(page, server);
    const branch = 'feature/launch-fail';
    await page.getByTestId('wt-add').click();
    await expect(page.getByTestId('create-worktree-modal')).toBeVisible();
    await page.getByTestId('wt-branch-input').fill(branch);
    await page.getByTestId('wt-create-button').click();
    const wtId = idForBranch(branch);
    const plug = page.getByTestId(`wt-plug-${wtId}`);
    await expect(plug).toBeVisible({ timeout: 20_000 });

    // Off → activate → the launch op fails asynchronously → the plug polls and reads error.
    await expect(plug).toHaveAttribute('data-status', 'off');
    await plug.click();
    await expect(plug).toHaveAttribute('data-status', 'error', { timeout: 15_000 });

    // Still no standalone session screen and no mobile-app handoff toast (Gate #1 + #2).
    await expect(page.getByTestId('session-handoff')).toHaveCount(0);
    await expect(page.getByTestId('sessions-list')).toHaveCount(0);
  } finally {
    // Close the browser context BEFORE the server. The SPA holds a keep-alive socket open (the
    // launch-status + liveness polls), and Node's `server.close()` waits for idle connections to
    // drain. Playwright only tears the context down AFTER the test returns, so closing it here is
    // what lets `server.close()` resolve — otherwise it deadlocks until the test timeout.
    await page.context().close();
    await server.close();
  }
});

test('a live session is listed on and blocks a non-force delete; stop clears it (seam end-to-end)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sess-api-'));
  const { runner } = makeFakeTmux();
  const server = await bootServer(root, runner);
  try {
    await cloneRepo(server);
    const wtId = await createViaApi(server, 'feature/seam');

    // Launch → the session is listed `on` (existence + mapping only, tmux truth).
    await api(server, '/sessions/launch', { repoId: REPO, wtId });
    await waitForSession(server, wtId, true);

    // A worktree with a live session is not idle → a non-force delete is refused (the seam).
    const refused = await api(server, '/worktrees/delete', { repoId: REPO, wtId }).then((r) =>
      r.json(),
    );
    expect(refused).toMatchObject({ status: 'not-safe' });

    // Stop → idempotent success → the session is no longer listed.
    const stopped = await api(server, '/sessions/stop', { repoId: REPO, wtId }).then((r) =>
      r.json(),
    );
    expect(stopped).toMatchObject({ status: 'stopped' });
    await waitForSession(server, wtId, false);
  } finally {
    await server.close();
  }
});
