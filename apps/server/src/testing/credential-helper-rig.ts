import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Credential-helper test rig (task 1.3). Exercises a credential helper's git-credential-protocol
 * I/O in isolation: feed it the `protocol=…\nhost=…\n\n` request on stdin and parse the
 * `key=value` lines it writes to stdout. Paired with `writeTokenFile`/`fileMode` so the helper's
 * `600`-mode token file in a temp `~/.switchboard` workspace can be asserted. The real helper
 * arrives in group 5.4; this rig is what its tests drive.
 */

export interface CredentialRequest {
  protocol?: string;
  host?: string;
  path?: string;
  username?: string;
}

export interface CredentialResult {
  /** Raw stdout from the helper. */
  stdout: string;
  /** Parsed `key=value` fields (e.g. `username`, `password`). */
  fields: Record<string, string>;
}

/** Encode a credential request as git's stdin protocol (newline-terminated, blank-line ended). */
function encodeRequest(request: CredentialRequest): string {
  const lines = Object.entries(request)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  return `${lines.join('\n')}\n\n`;
}

/** Parse the helper's `key=value\n` stdout into a field map. */
function parseFields(stdout: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) fields[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return fields;
}

/**
 * Run a credential helper for the `get` action: spawn `command` with `args`, write the encoded
 * `request` to its stdin, and parse its stdout.
 */
export function runCredentialHelper(
  command: string,
  args: string[],
  request: CredentialRequest,
  env?: NodeJS.ProcessEnv,
): CredentialResult {
  const stdout = execFileSync(command, args, {
    input: encodeRequest(request),
    encoding: 'utf8',
    env: env ?? process.env,
  });
  return { stdout, fields: parseFields(stdout) };
}

/** Write `contents` to `path` with `600` perms, creating parent dirs; returns the path. */
export function writeTokenFile(path: string, contents: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

/** The file's permission bits (e.g. `0o600`), masked to the low 9 bits. */
export function fileMode(path: string): number {
  return statSync(path).mode & 0o777;
}
