import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Packaged-CLI smoke test (`runtime-cli-docker` Decision 8).
 *
 * This exercises the BUILT bin (`dist/index.js`), NOT a workspace import — the gate runs the
 * CLI build before the test, so the artifact exists. It asserts the facts a packaged bin must
 * guarantee: `--version` prints the version; `start` boots a loopback server whose unauthenticated
 * `/health` answers 200; and `start` with a listen spec that includes the **dedicated serve
 * ingress** serves `/health` 200 on that port too. The smoke test runs on the HOST, so the serve
 * port is host-reachable: it runs with `trustServeIdentity` DISABLED (bearer-only) — the
 * host-reachable serve port is not identity-eligible and forged `tailscale-user-*` markers on it
 * grant nothing. The child is always terminated and its port freed.
 */

/** The built bin under test (`apps/cli/dist/index.js`). */
const BIN = fileURLToPath(new URL('../dist/index.js', import.meta.url));

/** The expected `--version` output, read straight from this package's manifest. */
const PKG = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string };

const BOOT_TIMEOUT_MS = 15_000;
const EXIT_TIMEOUT_MS = 10_000;
// Per-test budget — generous because each case spawns a child Node process. Passed to `it`
// directly so it holds under the root gate's Vitest config too (which keeps the 5s default).
const TEST_TIMEOUT_MS = 30_000;

/** Spawn the bin for a one-shot command and resolve with its captured output + exit code. */
function runOnce(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

/** Read the child's stdout until it announces the loopback URL; reject on timeout or early exit. */
function waitForUrl(child: ChildProcess, getStderr: () => string): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Timed out waiting for server URL.\nstdout:\n${buffer}\nstderr:\n${getStderr()}`),
      );
    }, BOOT_TIMEOUT_MS);

    const onData = (chunk: Buffer): void => {
      buffer += String(chunk);
      const match = /https?:\/\/127\.0\.0\.1:\d+/.exec(buffer);
      if (match) {
        cleanup();
        resolve(match[0]);
      }
    };
    const onExit = (code: number | null): void => {
      cleanup();
      reject(
        new Error(
          `CLI exited early (code ${code}) before printing a URL.\nstderr:\n${getStderr()}`,
        ),
      );
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.off('exit', onExit);
    };

    child.stdout?.on('data', onData);
    child.on('exit', onExit);
  });
}

/** Read the child's stdout until the URL line tagged `(tag)` appears (`(direct)` / `(serve)`). */
function waitForTaggedUrl(
  child: ChildProcess,
  tag: string,
  getStderr: () => string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const pattern = new RegExp(`\\(${tag}\\) on (https?://127\\.0\\.0\\.1:\\d+)`);
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out waiting for the ${tag} URL.\nstdout:\n${buffer}\nstderr:\n${getStderr()}`,
        ),
      );
    }, BOOT_TIMEOUT_MS);
    const onData = (chunk: Buffer): void => {
      buffer += String(chunk);
      const match = pattern.exec(buffer);
      if (match) {
        cleanup();
        resolve(match[1]);
      }
    };
    const onExit = (code: number | null): void => {
      cleanup();
      reject(new Error(`CLI exited early (code ${code}) before the ${tag} URL.\n${getStderr()}`));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout?.on('data', onData);
    child.on('exit', onExit);
  });
}

/** Provision a temp HOME whose `~/.switchboard/config.json` pins the given listen spec. */
function makeHomeWithConfig(listen: Record<string, unknown>): string {
  const home = mkdtempSync(join(tmpdir(), 'switchboard-cli-smoke-'));
  mkdirSync(join(home, '.switchboard'), { recursive: true });
  // trustServeIdentity is omitted (defaults OFF): the host-reachable serve port is bearer-only.
  writeFileSync(
    join(home, '.switchboard', 'config.json'),
    JSON.stringify({ bearerToken: 'smoke-test-bearer-token', listen }),
  );
  return home;
}

/** The full Tailscale serve markers — forged here (no real serve fronts the host serve port). */
const FORGED_SERVE_MARKERS: Record<string, string> = {
  'tailscale-user-login': 'nick-boey@github',
  'tailscale-headers-info': 'logins=1;caps=0',
  'x-forwarded-for': '100.100.50.1',
};

/** SIGINT the child and wait for graceful exit; SIGKILL as a last resort so no port leaks. */
function terminate(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const force = setTimeout(() => child.kill('SIGKILL'), EXIT_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
    child.kill('SIGINT');
  });
}

describe('packaged switchboard CLI (built bin)', () => {
  it(
    'prints its version with --version',
    async () => {
      const { stdout, code } = await runOnce(['--version']);
      expect(code).toBe(0);
      expect(stdout.trim()).toBe(PKG.version);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'start boots a loopback server whose /health responds 200',
    async () => {
      // Isolate `~/.switchboard` to a temp HOME so loadConfig never touches the real home dir.
      const home = mkdtempSync(join(tmpdir(), 'switchboard-cli-smoke-'));
      const child = spawn(process.execPath, [BIN, 'start'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: home },
      });
      let stderr = '';
      child.stderr?.on('data', (chunk) => (stderr += String(chunk)));

      try {
        const url = await waitForUrl(child, () => stderr);
        const res = await fetch(`${url}/health`);
        expect(res.status, `stderr:\n${stderr}`).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
      } finally {
        await terminate(child);
        rmSync(home, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'writes workspace data (operations/) under ~/.switchboard, never the working directory',
    async () => {
      // Regression for the workspace-root pollution bug: repos/, operations/, and `.github-token`
      // are derived from `ctx.workspaceRoot`, which must be the CONFIG DIR (`~/.switchboard`) — not
      // `process.cwd()`. The operations ledger `mkdir`s its root at startup, so booting from a
      // throwaway CWD is enough to prove the artifact lands under HOME/.switchboard, not the CWD.
      const home = mkdtempSync(join(tmpdir(), 'switchboard-cli-smoke-home-'));
      const cwd = mkdtempSync(join(tmpdir(), 'switchboard-cli-smoke-cwd-'));
      const child = spawn(process.execPath, [BIN, 'start'], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: home },
      });
      let stderr = '';
      child.stderr?.on('data', (chunk) => (stderr += String(chunk)));

      try {
        await waitForUrl(child, () => stderr);
        // The startup ledger lives under the config dir…
        expect(existsSync(join(home, '.switchboard', 'operations')), `stderr:\n${stderr}`).toBe(
          true,
        );
        // …and nothing was scattered into the (unrelated) working directory.
        expect(existsSync(join(cwd, 'operations'))).toBe(false);
        expect(existsSync(join(cwd, '.github-token'))).toBe(false);
      } finally {
        await terminate(child);
        rmSync(home, { recursive: true, force: true });
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'start serves /health 200 on the dedicated serve ingress (bearer-only; forged markers grant nothing)',
    async () => {
      // A listen spec with BOTH a direct and a dedicated serve loopback port (ephemeral).
      const home = makeHomeWithConfig({ direct: { port: 0 }, serve: { port: 0 } });
      const child = spawn(process.execPath, [BIN, 'start'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: home },
      });
      let stderr = '';
      child.stderr?.on('data', (chunk) => (stderr += String(chunk)));

      try {
        const serveUrl = await waitForTaggedUrl(child, 'serve', () => stderr);

        // /health is unauthenticated and answers 200 on the dedicated serve port.
        const health = await fetch(`${serveUrl}/health`);
        expect(health.status, `stderr:\n${stderr}`).toBe(200);
        expect(await health.json()).toEqual({ status: 'ok' });

        // The host-reachable serve port is bearer-only: forged serve markers + an allowlisted
        // login, without a bearer, are NOT admitted (they grant nothing).
        const forged = await fetch(`${serveUrl}/echo`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...FORGED_SERVE_MARKERS },
          body: JSON.stringify({ message: 'hi' }),
        });
        expect(forged.status, `forged markers must not be admitted; stderr:\n${stderr}`).toBe(401);
      } finally {
        await terminate(child);
        rmSync(home, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT_MS,
  );
});
