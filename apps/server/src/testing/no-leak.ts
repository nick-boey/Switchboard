import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { RuntimeSpan, RuntimeTelemetry } from '@switchboard/shared';
import { redactAttributes } from '../telemetry.js';

/**
 * No-leak assertion harness (task 1.2). The PAT must never reach git's argv, the cloned bare
 * config, any file under the clone, or telemetry. These helpers let the credential-helper /
 * clone tests (groups 5–6) prove that by scanning each surface for a planted secret. The
 * telemetry capture reuses the foundations redaction path (`redactAttributes`) so the test
 * exercises the same scrubbing the exporter applies.
 */

/** Recursively collect every file path under `root` (skips nothing — packed objects included). */
function walk(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  if (statSync(root).isDirectory()) visit(root);
  return out;
}

/**
 * Scan every file under `root` for the literal `secret`, returning the relative paths of any
 * file that contains it. An empty array is the no-leak proof; a non-empty array names the leak.
 */
export function scanDirForSecret(root: string, secret: string): string[] {
  const hits: string[] = [];
  for (const file of walk(root)) {
    let contents: string;
    try {
      contents = readFileSync(file, 'utf8');
    } catch {
      continue; // unreadable/binary — never holds the plaintext secret
    }
    if (contents.includes(secret)) hits.push(relative(root, file));
  }
  return hits;
}

/**
 * Read the credential/remote-URL lines persisted in a bare repository's OWN config the way an
 * auditor would: `git --git-dir <bare> config --local --get-regexp '^(credential|remote\..*\.url)'`.
 * `--local` scopes the read to the repo's config file (never the user's global/system git config),
 * so the result reflects only what the clone itself wrote. Returns the raw matching lines — a
 * clean clone yields either nothing or a credential-free `remote.origin.url`; the caller asserts
 * no `credential.*` line and no PAT-bearing URL is present.
 */
export function bareConfigCredentialLines(bareGitDir: string): string[] {
  try {
    const out = execFileSync(
      'git',
      [
        '--git-dir',
        bareGitDir,
        'config',
        '--local',
        '--get-regexp',
        '^(credential|remote\\..*\\.url)',
      ],
      { encoding: 'utf8' },
    );
    return out.split('\n').filter((line) => line.trim().length > 0);
  } catch {
    // `git config --get-regexp` exits non-zero when nothing matches — that is the clean case.
    return [];
  }
}

/** A telemetry span captured for inspection: its name and post-redaction attributes. */
export interface CapturedSpan {
  name: string;
  attributes: Record<string, unknown>;
}

export interface TelemetryCapture {
  /** Drop-in `RuntimeTelemetry` that records every span (with redaction applied). */
  telemetry: RuntimeTelemetry;
  /** All spans recorded so far. */
  spans: () => CapturedSpan[];
  /** True if `secret` appears in any captured span name or attribute value. */
  containsSecret: (secret: string) => boolean;
}

/**
 * A `RuntimeTelemetry` that records spans after running their attributes through the production
 * `redactAttributes` blocklist — so a no-leak test asserts against exactly what an exporter would
 * see, not the raw values a service passed in.
 */
export function createTelemetryCapture(): TelemetryCapture {
  const captured: CapturedSpan[] = [];
  const telemetry: RuntimeTelemetry = {
    startSpan(name, attrs): RuntimeSpan {
      const attributes = redactAttributes(
        (attrs ?? {}) as Record<string, string | number | boolean | undefined>,
      );
      captured.push({ name, attributes });
      return { end(): void {} };
    },
  };
  return {
    telemetry,
    spans: () => captured,
    containsSecret(secret) {
      return captured.some(
        (span) =>
          span.name.includes(secret) ||
          Object.values(span.attributes).some(
            (value) => typeof value === 'string' && value.includes(secret),
          ),
      );
    },
  };
}
