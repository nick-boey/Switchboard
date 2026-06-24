import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Resolve the PATH to the Tailscale auth-key secret. `--docker` passes this to `tailscale up` via
 * the `--auth-key=file:<path>` form, so the key VALUE never enters argv or logs.
 *
 * Precedence — a raw env key WINS over a stale persisted default so a ROTATED key recovers across
 * restarts of the documented persistent `/root/.switchboard` volume (otherwise the first env-based
 * start materialises the secret file and later starts would keep handing the revoked key to
 * `tailscale up`):
 *   1. `TS_AUTHKEY_FILE` — an explicit mounted-secret path (the conventional `*_FILE` form), used
 *      as-is and never rewritten;
 *   2. a raw env key (`TS_AUTHKEY` / `TAILSCALE_AUTHKEY`) — materialised to the default secret file
 *      by an ATOMIC, mode-`600` rewrite so the CURRENT env value wins over any stale persisted file;
 *   3. the existing mounted/persisted default `secrets/tailscale-authkey` under the config dir.
 * The key is only ever handed to `tailscale up` by file reference, never inlined into argv.
 */
export function resolveAuthKeyFile(configDir: string): string {
  const explicit = process.env.TS_AUTHKEY_FILE;
  if (explicit && explicit.trim().length > 0) return explicit.trim();

  const defaultPath = join(configDir, 'secrets', 'tailscale-authkey');

  // A raw env key takes PRECEDENCE over a persisted default: materialise the CURRENT value so a
  // rotated key is honoured rather than the runtime re-using a stale file from a revoked key.
  const fromEnv = process.env.TS_AUTHKEY ?? process.env.TAILSCALE_AUTHKEY;
  if (fromEnv && fromEnv.trim().length > 0) {
    writeAuthKeyFileAtomically(defaultPath, fromEnv.trim());
    return defaultPath;
  }

  if (existsSync(defaultPath)) return defaultPath;

  throw new Error(
    'no Tailscale auth key found: set TS_AUTHKEY_FILE to the mounted secret path, place the key in ' +
      'secrets/tailscale-authkey under the config dir, or set TS_AUTHKEY (a mounted-secret value)',
  );
}

/**
 * Materialise a secret to `path` by an ATOMIC, mode-`600` rewrite: write a temp sibling (created
 * `600`, then chmod-enforced even under a permissive umask), then `rename` it over the target. The
 * rename is atomic on the same filesystem, so a concurrent reader sees either the old or the new key
 * file — never a truncated/partial write — and the materialised file always ends up owner-only.
 */
function writeAuthKeyFileAtomically(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${value}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600); // enforce 600 even if a permissive umask widened the create mode
  renameSync(tmp, path);
}
