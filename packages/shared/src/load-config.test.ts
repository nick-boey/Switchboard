import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './load-config';

describe('loadConfig', () => {
  const dirs: string[] = [];

  function freshDir(): string {
    const d = mkdtempSync(join(tmpdir(), 'switchboard-cfg-'));
    dirs.push(d);
    return d;
  }

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it('creates secure mode-600 defaults on first run with a generated bearer token', () => {
    const configDir = join(freshDir(), '.switchboard');
    const cfg = loadConfig({ configDir });

    const file = join(configDir, 'config.json');
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);

    expect(cfg.bearerToken.length).toBeGreaterThan(16);
    expect(cfg.trustServeIdentity).toBe(false);
    expect(cfg.telemetry.exporter).toBe('none');
    // serve-web-spa F1: first-run default allowlist is empty (no baked-in identity).
    expect(cfg.identityAllowlist).toEqual([]);

    // Token actually persisted to disk.
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(onDisk.bearerToken).toBe(cfg.bearerToken);
  });

  it('reads and validates an existing config', () => {
    const configDir = join(freshDir(), '.switchboard');
    loadConfig({ configDir });
    const again = loadConfig({ configDir });
    expect(again.bearerToken.length).toBeGreaterThan(16);
  });

  it('throws a field-named error on invalid config', () => {
    const dir = freshDir();
    const configDir = join(dir, '.switchboard');
    // create then corrupt
    loadConfig({ configDir });
    const file = join(configDir, 'config.json');
    writeFileSync(file, JSON.stringify({ bearerToken: 'x', telemetry: { exporter: 'seq' } }));

    expect(() => loadConfig({ configDir })).toThrow(/telemetry/);
  });

  it('throws on malformed JSON', () => {
    const configDir = join(freshDir(), '.switchboard');
    loadConfig({ configDir });
    writeFileSync(join(configDir, 'config.json'), '{ not json');
    expect(() => loadConfig({ configDir })).toThrow();
  });
});
