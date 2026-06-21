import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { type AppConfig, configSchema } from './config.js';

export interface LoadConfigOptions {
  /** Config directory; defaults to `~/.switchboard`. Tests pass a temp dir. */
  configDir?: string;
}

/**
 * Standalone config loader (design Decision 6). Runs BEFORE `start(ctx)`:
 * - first run: creates the directory + `config.json` with secure `600` defaults and a
 *   freshly generated bearer token (identity trust disabled);
 * - existing file: reads + validates against the shared Zod schema, throwing a clear,
 *   field-named error if it is invalid so startup refuses to proceed.
 *
 * Performs all file I/O here so `start(ctx)` can be pure (it receives the parsed config).
 */
export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const configDir = options.configDir ?? join(homedir(), '.switchboard');
  const configPath = join(configDir, 'config.json');

  if (!existsSync(configPath)) {
    return createDefaultConfig(configDir, configPath);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (cause) {
    throw new Error(`Invalid Switchboard config: ${configPath} is not valid JSON`, { cause });
  }

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid Switchboard config: ${formatIssue(result.error)}`);
  }
  return result.data;
}

function createDefaultConfig(configDir: string, configPath: string): AppConfig {
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const defaults = configSchema.parse({ bearerToken: randomBytes(32).toString('hex') });
  writeFileSync(configPath, `${JSON.stringify(defaults, null, 2)}\n`, { mode: 0o600 });
  // Defensive: enforce 600 even if a permissive umask widened the create mode.
  chmodSync(configPath, 0o600);
  return defaults;
}

function formatIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
  return `${field}: ${issue.message}`;
}
