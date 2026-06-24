import { chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '@switchboard/shared/node';
import type { AppConfig } from '@switchboard/shared';

/**
 * Config bootstrap (`runtime-cli-docker` Decision 4) — the runtime's provisioning front door.
 *
 * Wraps `loadConfig()` (which creates `~/.switchboard` at `700` + `config.json` at `600` with
 * secure defaults on first run, and validates an existing file, refusing with a field-named error),
 * additionally provisions the `run/` and `secrets/` subdirectories at `700`, and enforces the
 * mode-aware cross-field rule (5.4) BEFORE any listener binds. Idempotent: an existing valid
 * `~/.switchboard` is left intact and only missing pieces are created.
 *
 * The runtime **mode** is a bootstrap input, not a config field (the shared schema stays
 * mode-agnostic): `--docker` asserts no host publication (container isolation), which is the
 * precondition that makes a serve ingress identity-eligible. The result carries the assertion
 * through to `start(ctx)` so the serve ingress is bound identity-eligible only under it.
 */
export interface BootstrapOptions {
  /** Config directory; defaults to `~/.switchboard`. Tests pass a temp dir. */
  configDir?: string;
  /**
   * The runtime's no-host-publication assertion (set by `--docker` mode, NOT by config). Defaults
   * to `false` — a host run, where any serve ingress is host-reachable and therefore bearer-only.
   */
  assertNoHostPublication?: boolean;
}

export interface BootstrapResult {
  config: AppConfig;
  configDir: string;
  /** Carried through to `start(ctx)`; the serve ingress is identity-eligible only when `true`. */
  assertNoHostPublication: boolean;
}

/** Provision a `700` directory, enforcing the mode when freshly created (idempotent otherwise). */
function ensureDir(path: string): void {
  const created = mkdirSync(path, { recursive: true, mode: 0o700 });
  // `mkdirSync(recursive)` returns the first created path, or `undefined` when it already existed.
  // Enforce `700` on creation even if a permissive umask widened the create mode.
  if (created !== undefined) chmodSync(path, 0o700);
}

export function bootstrap(options: BootstrapOptions = {}): BootstrapResult {
  const configDir = options.configDir ?? join(homedir(), '.switchboard');
  const assertNoHostPublication = options.assertNoHostPublication ?? false;

  // `loadConfig` provisions the dir (700) + `config.json` (600) on first run and validates an
  // existing one (throwing a field-named error so startup refuses to proceed).
  const config = loadConfig({ configDir });

  // Provision the run + secrets subdirs (700) — idempotent (a no-op when already present).
  ensureDir(join(configDir, 'run'));
  ensureDir(join(configDir, 'secrets'));

  // Mode-aware cross-field validation (Decision 3/4): serve-identity trust paired with a serve
  // ingress is rejected UNLESS the runtime asserts no host publication — a fail-fast guard against
  // binding a host-reachable, identity-eligible port (closed before any listener binds). A serve
  // ingress WITHOUT trust is permitted for local host use (bearer-only).
  if (config.trustServeIdentity && config.listen.serve && !assertNoHostPublication) {
    throw new Error(
      'Invalid Switchboard config: trustServeIdentity may not be paired with a serve ingress ' +
        '(listen.serve) outside the container runtime — a host-reachable serve port can never be ' +
        'identity-eligible. Run with --docker (which asserts no host publication), remove ' +
        'listen.serve, or disable trustServeIdentity.',
    );
  }

  return { config, configDir, assertNoHostPublication };
}
