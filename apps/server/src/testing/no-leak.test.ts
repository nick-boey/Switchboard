import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bareConfigCredentialLines, createTelemetryCapture, scanDirForSecret } from './no-leak.js';

/**
 * Smoke test for the no-leak harness (task 1.2). Proves each scanner DETECTS a planted secret
 * (the positive control that makes a later "no hits" assertion meaningful) and that the
 * telemetry capture applies the production redaction blocklist.
 */
describe('no-leak assertion harness', () => {
  const SECRET = 'ghp_planted_secret_token_0123456789';
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'no-leak-smoke-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('scanDirForSecret finds a planted secret and reports clean otherwise', () => {
    writeFileSync(join(root, 'clean.txt'), 'nothing here');
    expect(scanDirForSecret(root, SECRET)).toEqual([]);
    writeFileSync(join(root, 'leak.txt'), `token=${SECRET}`);
    expect(scanDirForSecret(root, SECRET)).toEqual(['leak.txt']);
  });

  it('bareConfigCredentialLines reports a persisted credential helper and is empty when clean', () => {
    const bare = join(root, 'repo.git');
    execFileSync('git', ['init', '--bare', '--quiet', bare]);
    expect(bareConfigCredentialLines(bare)).toEqual([]);
    execFileSync('git', ['--git-dir', bare, 'config', 'credential.helper', 'store']);
    expect(bareConfigCredentialLines(bare).join('\n')).toContain('credential.helper');
  });

  it('telemetry capture redacts blocklisted attributes but still surfaces an unredacted leak', () => {
    const capture = createTelemetryCapture();
    // A PAT under a blocklisted key is masked → not present.
    capture.telemetry.startSpan('clone', { pat: SECRET }).end();
    expect(capture.containsSecret(SECRET)).toBe(false);
    // A secret leaked into a span NAME is caught (positive control).
    capture.telemetry.startSpan(`clone ${SECRET}`, {}).end();
    expect(capture.containsSecret(SECRET)).toBe(true);
  });
});
