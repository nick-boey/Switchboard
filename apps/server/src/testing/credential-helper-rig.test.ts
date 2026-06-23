import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileMode, runCredentialHelper, writeTokenFile } from './credential-helper-rig.js';

/**
 * Smoke test for the credential-helper rig (task 1.3). A throwaway helper script reads a
 * `600`-mode token file and emits it over the credential protocol; the rig feeds it a request
 * and parses the response. Proves the protocol I/O and the `600`-perm helpers the real helper's
 * tests (group 5.4) rely on.
 */
describe('credential-helper test rig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cred-rig-smoke-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('feeds the credential protocol to a helper and parses its emitted fields', () => {
    const tokenPath = writeTokenFile(join(dir, '.switchboard', 'token'), 'ghp_rig_token');
    expect(fileMode(tokenPath)).toBe(0o600);

    // A minimal helper: read the token file named by --token-file, emit it as the password.
    const script = join(dir, 'helper.mjs');
    writeFileSync(
      script,
      [
        'import { readFileSync } from "node:fs";',
        'const i = process.argv.indexOf("--token-file");',
        'const token = readFileSync(process.argv[i + 1], "utf8").trim();',
        'process.stdout.write(`username=x-access-token\\npassword=${token}\\n`);',
      ].join('\n'),
    );

    const result = runCredentialHelper('node', [script, '--token-file', tokenPath], {
      protocol: 'https',
      host: 'github.com',
    });

    expect(result.fields.username).toBe('x-access-token');
    expect(result.fields.password).toBe('ghp_rig_token');
  });
});
