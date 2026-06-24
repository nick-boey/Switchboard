import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileMode, runCredentialHelper } from '../testing/credential-helper-rig.js';
import { makeServerTestContext } from '../testing/operation-scaffolding.js';
import {
  credentialHelperArgs,
  ensureCredentialHelperScript,
  TOKEN_FILE_ENV,
  TOKEN_FILE_NAME,
  writeGithubToken,
} from './credential-helper.js';
import { join } from 'node:path';

/**
 * Tests for the credential helper (task 5.4) via the group-1.3 rig. The helper reads the PAT from
 * a `600`-mode token file and emits it over git's credential protocol for `get` only; it persists
 * nothing, and the host-scoped `-c` wiring carries no token.
 */
describe('github credential helper', () => {
  const PAT = 'ghp_helper_token_value';

  it('writes the PAT to a 600-mode token file', () => {
    const { ctx } = makeServerTestContext();
    const path = writeGithubToken(ctx, PAT);
    expect(path).toBe(join(ctx.workspaceRoot, TOKEN_FILE_NAME));
    expect(fileMode(path)).toBe(0o600);
    expect(readFileSync(path, 'utf8')).toBe(PAT);
  });

  it('emits the PAT over the credential protocol for the get action', () => {
    const { ctx } = makeServerTestContext();
    const tokenFile = writeGithubToken(ctx, PAT);
    const script = ensureCredentialHelperScript(ctx);
    const result = runCredentialHelper(
      'node',
      [script, 'get'],
      { protocol: 'https', host: 'github.com' },
      { ...process.env, [TOKEN_FILE_ENV]: tokenFile },
    );
    expect(result.fields.username).toBe('x-access-token');
    expect(result.fields.password).toBe(PAT);
  });

  it('emits nothing for non-get actions (no persistence)', () => {
    const { ctx } = makeServerTestContext();
    const tokenFile = writeGithubToken(ctx, PAT);
    const script = ensureCredentialHelperScript(ctx);
    for (const action of ['store', 'erase']) {
      const result = runCredentialHelper(
        'node',
        [script, action],
        { protocol: 'https', host: 'github.com' },
        { ...process.env, [TOKEN_FILE_ENV]: tokenFile },
      );
      expect(result.stdout.trim()).toBe('');
    }
  });

  it('the helper script body holds no token (the secret is file-resident only)', () => {
    const { ctx } = makeServerTestContext();
    const script = ensureCredentialHelperScript(ctx);
    expect(readFileSync(script, 'utf8')).not.toContain(PAT);
  });

  it('builds host-scoped -c args that reset inherited helpers and carry no token', () => {
    const args = credentialHelperArgs('/tmp/helper.mjs');
    expect(args).toContain('credential.helper=');
    expect(args.some((a) => a.startsWith('credential.https://github.com.helper='))).toBe(true);
    expect(args.join(' ')).not.toContain(PAT);
  });
});
