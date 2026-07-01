import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrap } from './bootstrap';

/**
 * Config bootstrap (`runtime-cli-docker` group 5). Bootstrap is the runtime's provisioning front
 * door: it wraps `loadConfig()` (which writes `config.json` at `600` on first run), additionally
 * provisions the run/secrets dirs at `700`, and enforces the mode-aware cross-field rule before any
 * listener binds. Tests point the config at a temp dir so the real `~/.switchboard` is untouched.
 */
describe('bootstrap', () => {
  const dirs: string[] = [];
  function freshConfigDir(): string {
    const d = mkdtempSync(join(tmpdir(), 'switchboard-bootstrap-'));
    dirs.push(d);
    return join(d, '.switchboard');
  }
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it('first run: provisions config.json (600) and the run/secrets dirs (700)', () => {
    const configDir = freshConfigDir();
    const result = bootstrap({ configDir });

    const file = join(configDir, 'config.json');
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(configDir, 'run')).mode & 0o777).toBe(0o700);
    expect(statSync(join(configDir, 'secrets')).mode & 0o777).toBe(0o700);
    expect(result.config.bearerToken.length).toBeGreaterThan(16);
    // Host bootstrap (no --docker) does not assert container isolation.
    expect(result.assertNoHostPublication).toBe(false);
  });

  it('is idempotent over an existing valid config (bearer token intact, only missing pieces created)', () => {
    const configDir = freshConfigDir();
    const first = bootstrap({ configDir });
    // Remove a provisioned subdir to prove bootstrap recreates only what is missing.
    rmSync(join(configDir, 'run'), { recursive: true, force: true });

    const second = bootstrap({ configDir });
    expect(second.config.bearerToken).toBe(first.config.bearerToken);
    expect(statSync(join(configDir, 'run')).mode & 0o777).toBe(0o700);
    expect(statSync(join(configDir, 'config.json')).mode & 0o777).toBe(0o600);
  });

  it('refuses an invalid config with a field-named error', () => {
    const configDir = freshConfigDir();
    bootstrap({ configDir });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ bearerToken: 'x', telemetry: { exporter: 'seq' } }),
    );
    expect(() => bootstrap({ configDir })).toThrow(/telemetry/);
  });

  // --- Mode-aware cross-field validation (task 5.3 / Decision 3/4) -------------------------------

  /** Write a config that pairs `trustServeIdentity` with a serve ingress, then bootstrap it. */
  function withServeTrust(configDir: string): void {
    bootstrap({ configDir }); // provision a valid baseline first
    const cfg = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'));
    cfg.trustServeIdentity = true;
    cfg.listen = { direct: { port: 0 }, serve: { port: 4180 } };
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(cfg));
  }

  it('rejects trustServeIdentity + a serve ingress on the host (no --docker) with a field-named error', () => {
    const configDir = freshConfigDir();
    withServeTrust(configDir);
    expect(() => bootstrap({ configDir })).toThrow(/trustServeIdentity/);
    // It must name the serve-ingress field too, so the operator can see the offending pairing.
    expect(() => bootstrap({ configDir })).toThrow(/listen\.serve/);
  });

  it('accepts the same config under --docker (the runtime asserts no host publication)', () => {
    const configDir = freshConfigDir();
    withServeTrust(configDir);
    const result = bootstrap({ configDir, assertNoHostPublication: true });
    expect(result.assertNoHostPublication).toBe(true);
    expect(result.config.trustServeIdentity).toBe(true);
    expect(result.config.listen.serve).toEqual({ port: 4180 });
  });

  it('accepts a serve ingress WITHOUT trustServeIdentity on the host (bearer-only)', () => {
    const configDir = freshConfigDir();
    bootstrap({ configDir });
    const cfg = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'));
    cfg.listen = { direct: { port: 0 }, serve: { port: 4180 } }; // trustServeIdentity stays false
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(cfg));
    const result = bootstrap({ configDir });
    expect(result.config.trustServeIdentity).toBe(false);
    expect(result.config.listen.serve).toEqual({ port: 4180 });
  });

  // --- serve-web-spa F1: `--docker` first-run trust default (D6, upgrade-safe per F-A1) ----------

  it('first-run --docker: creates config with trustServeIdentity ON + an EMPTY allowlist (admits nobody)', () => {
    const configDir = freshConfigDir();
    const result = bootstrap({ configDir, assertNoHostPublication: true });
    expect(result.config.trustServeIdentity).toBe(true);
    expect(result.config.identityAllowlist).toEqual([]);
    // The default is persisted into the newly created config.
    const onDisk = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'));
    expect(onDisk.trustServeIdentity).toBe(true);
  });

  it('existing --docker config WITHOUT the trust field is NOT upgraded (trust off; persisted allowlist untouched)', () => {
    const configDir = freshConfigDir();
    bootstrap({ configDir }); // baseline
    // Simulate a config provisioned before this change: no trust field, a persisted allowlist.
    const cfg = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'));
    delete cfg.trustServeIdentity;
    cfg.identityAllowlist = ['legacy@github'];
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(cfg));

    const result = bootstrap({ configDir, assertNoHostPublication: true });
    expect(result.config.trustServeIdentity).toBe(false); // first-run default never applies on load
    expect(result.config.identityAllowlist).toEqual(['legacy@github']); // untouched
  });

  it('existing --docker config with an explicit trustServeIdentity:false is respected', () => {
    const configDir = freshConfigDir();
    bootstrap({ configDir });
    const cfg = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'));
    cfg.trustServeIdentity = false;
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(cfg));
    const result = bootstrap({ configDir, assertNoHostPublication: true });
    expect(result.config.trustServeIdentity).toBe(false);
  });

  it('non-docker first-run defaults trust OFF', () => {
    const configDir = freshConfigDir();
    const result = bootstrap({ configDir });
    expect(result.config.trustServeIdentity).toBe(false);
  });
});
