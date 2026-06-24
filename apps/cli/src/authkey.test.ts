import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAuthKeyFile } from './authkey';

/**
 * Auth-key resolution for `--docker` (`runtime-cli-docker` Decision 6). `resolveAuthKeyFile` decides
 * which FILE `tailscale up` reads the key from (`--auth-key=file:<path>`); the raw key value never
 * reaches argv — it is only ever materialised to a `600` file and referenced by path. These cover
 * the precedence order, including the rotation-recovery fix: a raw env key WINS over a stale
 * persisted default so a rotated `TS_AUTHKEY` is honoured across restarts of the persistent volume.
 */
const ENV_KEYS = ['TS_AUTHKEY_FILE', 'TS_AUTHKEY', 'TAILSCALE_AUTHKEY'] as const;
let saved: Record<string, string | undefined>;
let configDir: string;

const secretPath = (): string => join(configDir, 'secrets', 'tailscale-authkey');
const mode = (path: string): number => statSync(path).mode & 0o777;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  configDir = mkdtempSync(join(tmpdir(), 'switchboard-authkey-'));
  // Mirror bootstrap: the secrets/ subdir exists (700) before resolution runs.
  mkdirSync(join(configDir, 'secrets'), { recursive: true, mode: 0o700 });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(configDir, { recursive: true, force: true });
});

describe('resolveAuthKeyFile', () => {
  it('a rotated TS_AUTHKEY env value WINS over a stale persisted default (rewritten at 600)', () => {
    // The documented persistent `/root/.switchboard` volume keeps the materialised secret across
    // restarts; an earlier start wrote the OLD (now rotated-out / revoked) key to the default file.
    writeFileSync(secretPath(), 'tskey-OLD-rotated-out\n', { mode: 0o600 });
    // A later start supplies a DIFFERENT, current key via the env.
    process.env.TS_AUTHKEY = 'tskey-NEW-current';

    const resolved = resolveAuthKeyFile(configDir);

    // It resolves to the default file BY REFERENCE (the `file:` form reads this path)...
    expect(resolved).toBe(secretPath());
    // ...the file now holds the CURRENT env value, not the stale persisted one (rotation recovers)...
    expect(readFileSync(resolved, 'utf8').trim()).toBe('tskey-NEW-current');
    // ...and the rewrite is owner-only (mode 600).
    expect(mode(resolved)).toBe(0o600);
  });

  it('TAILSCALE_AUTHKEY is honoured the same way as TS_AUTHKEY', () => {
    writeFileSync(secretPath(), 'tskey-OLD\n', { mode: 0o600 });
    process.env.TAILSCALE_AUTHKEY = 'tskey-NEW-via-alias';

    const resolved = resolveAuthKeyFile(configDir);

    expect(resolved).toBe(secretPath());
    expect(readFileSync(resolved, 'utf8').trim()).toBe('tskey-NEW-via-alias');
  });

  it('materialises a first-run env key (no pre-existing file) at mode 600', () => {
    process.env.TS_AUTHKEY = 'tskey-first-run';

    const resolved = resolveAuthKeyFile(configDir);

    expect(resolved).toBe(secretPath());
    expect(readFileSync(resolved, 'utf8').trim()).toBe('tskey-first-run');
    expect(mode(resolved)).toBe(0o600);
  });

  it('TS_AUTHKEY_FILE takes precedence over everything and is used as-is (no rewrite)', () => {
    // An explicit mounted-secret path wins even when a default file and an env key are both present.
    writeFileSync(secretPath(), 'tskey-default\n', { mode: 0o600 });
    process.env.TS_AUTHKEY = 'tskey-env';
    const explicit = join(configDir, 'mounted-secret');
    writeFileSync(explicit, 'tskey-mounted\n', { mode: 0o600 });
    process.env.TS_AUTHKEY_FILE = explicit;

    const resolved = resolveAuthKeyFile(configDir);

    expect(resolved).toBe(explicit);
    // The explicit file is referenced verbatim; neither it nor the default is rewritten.
    expect(readFileSync(explicit, 'utf8').trim()).toBe('tskey-mounted');
    expect(readFileSync(secretPath(), 'utf8').trim()).toBe('tskey-default');
  });

  it('falls back to the persisted default file when no env key is set (used as-is)', () => {
    writeFileSync(secretPath(), 'tskey-persisted\n', { mode: 0o600 });

    const resolved = resolveAuthKeyFile(configDir);

    expect(resolved).toBe(secretPath());
    expect(readFileSync(resolved, 'utf8').trim()).toBe('tskey-persisted');
  });

  it('throws a clear error when neither an env key, an explicit file, nor a default exist', () => {
    expect(() => resolveAuthKeyFile(configDir)).toThrow(/no Tailscale auth key found/);
  });
});
