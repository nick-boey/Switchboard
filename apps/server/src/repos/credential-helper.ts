import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeContext } from '@switchboard/shared';

/**
 * Credential-helper token handling (design Decision 4). The PAT reaches git ONLY via a credential
 * helper that reads it from a `600`-mode token file in `~/.switchboard` and emits it over git's
 * credential protocol. The helper is wired per-invocation with host-scoped `-c` (so it is never
 * persisted into the cloned bare config), and the token never appears in the clone URL, process
 * argv, or env (only the token-file PATH is passed via env, never the secret itself).
 */

/** Name of the `600`-mode PAT file under `~/.switchboard`. */
export const TOKEN_FILE_NAME = '.github-token';
/** Name of the generated credential-helper script under `~/.switchboard`. */
export const HELPER_SCRIPT_NAME = 'github-credential-helper.mjs';
/** Env var carrying the token-file PATH (never the token) to the helper subprocess. */
export const TOKEN_FILE_ENV = 'SWITCHBOARD_GITHUB_TOKEN_FILE';

/**
 * A self-contained Node credential helper. Reads the PAT from the file named by
 * `TOKEN_FILE_ENV` and emits it for git's `get` action only; writes nothing (no persistence).
 * Plain `.mjs` so git can run it via `node` in both source and built modes.
 */
const HELPER_SOURCE = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
// git invokes the helper as: helper <get|store|erase>. Only respond to 'get'; never persist.
const action = process.argv[2];
if (action !== 'get') process.exit(0);
const tokenFile = process.env[${JSON.stringify(TOKEN_FILE_ENV)}];
if (!tokenFile) process.exit(0);
let token = '';
try {
  token = readFileSync(tokenFile, 'utf8').trim();
} catch {
  process.exit(0);
}
if (!token) process.exit(0);
process.stdout.write(\`username=x-access-token\\npassword=\${token}\\n\`);
`;

/** Write the PAT to the `600`-mode token file under `~/.switchboard`; returns its path. */
export function writeGithubToken(ctx: RuntimeContext, token: string): string {
  const path = join(ctx.workspaceRoot, TOKEN_FILE_NAME);
  writeFileSync(path, token, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

/** Write (idempotently) the credential-helper script under `~/.switchboard`; returns its path. */
export function ensureCredentialHelperScript(ctx: RuntimeContext): string {
  const path = join(ctx.workspaceRoot, HELPER_SCRIPT_NAME);
  writeFileSync(path, HELPER_SOURCE, { mode: 0o700 });
  chmodSync(path, 0o700);
  return path;
}

/**
 * Build the host-scoped `-c` arguments that wire the helper for github.com only. The leading
 * empty `credential.helper=` resets any inherited helper (e.g. the user's keychain) so ONLY our
 * helper is consulted, and the host-scoped value means nothing applies to any other host. Passed
 * as `-c` (never written), so the cloned bare config carries no credential-helper entry.
 */
export function credentialHelperArgs(scriptPath: string): string[] {
  return [
    '-c',
    'credential.helper=',
    '-c',
    `credential.https://github.com.helper=!node '${scriptPath}'`,
  ];
}
