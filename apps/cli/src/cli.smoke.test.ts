import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Packaged-CLI smoke test (design Decision 8 / task 7.1).
 *
 * This exercises the BUILT bin (`dist/index.js`), NOT a workspace import — the gate runs the
 * CLI build before the test, so the artifact exists. It asserts the two facts a packaged bin
 * must guarantee: `--version` prints the version, and `start` boots a loopback server whose
 * unauthenticated `/health` answers 200. The child is always terminated and its port freed.
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
});
