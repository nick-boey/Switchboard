import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import {
  bridgeSessionIdSchema,
  type BridgeSessionId,
  type RuntimeTelemetry,
} from '@switchboard/shared';

/**
 * Cloud bridge-session-id resolver (plan Decisions 1/5/6/7, design Decision 3).
 *
 * Switchboard launches every session with `claude --session-id <uuid> --remote-control`, so claude
 * writes a per-session state file `~/.claude/sessions/<pid>.json` carrying that local `sessionId`
 * (the launch UUID we recorded in the operation ledger) alongside a `bridgeSessionId` (`session_…`)
 * — the CLOUD id behind a `https://claude.ai/code/<id>` link, a DIFFERENT namespace from the local
 * UUID, so it must be retrieved, never synthesised.
 *
 * This module is the ONE place that knows that undocumented file format. It builds a single bounded
 * `sessionId → bridgeSessionId` index per liveness poll and exposes a pure lookup; `sessionService`
 * owns the ledger read (the recorded launch UUID) and passes it in, so the resolver has no ledger
 * edge (plan Decision 5). The dependency is contained: each file is Zod-validated with a TOLERANT
 * schema, so additive Claude-state drift (an unknown field) still resolves with no telemetry, while
 * a breaking change (a missing/invalid required field, a bad token, a parse/size failure, or hitting
 * the scan bound) degrades to NO link plus structured reason-code telemetry — never an error, never
 * load-bearing for tmux-derived liveness. The bounded scan reads at most the newest-N files by mtime
 * within a deadline (live sessions are the recent ones); overflow files are left unread.
 *
 * Task 1.2 (this part): the injectable sessions-dir + fs seam, so unit tests point the resolver at a
 * fixtures dir without touching the real home. The bounded scan + lookup land in tasks 4.2/4.4.
 */

/** The minimal fs surface the bounded sessions-dir scan needs (injectable for tests). */
export interface SessionsFs {
  /** List the entries (file names) in `dir`; rejects if the dir is absent. */
  readdir(dir: string): Promise<string[]>;
  /** Stat a file for its modification time (newest-N ordering) and byte size (the size guard). */
  stat(path: string): Promise<{ mtimeMs: number; size: number }>;
  /** Read a file's contents as UTF-8 text. */
  readFile(path: string): Promise<string>;
}

/** The real fs seam over `node:fs/promises` — the production default. */
export const defaultSessionsFs: SessionsFs = {
  readdir: (dir) => readdir(dir),
  stat: async (path) => {
    const s = await stat(path);
    return { mtimeMs: s.mtimeMs, size: s.size };
  },
  readFile: (path) => readFile(path, 'utf8'),
};

/** Claude's per-session state directory (`~/.claude/sessions`), the default scan target. */
export function defaultSessionsDir(): string {
  return join(homedir(), '.claude', 'sessions');
}

/** Re-exported for the fs seam implementations (real + fake) to resolve a file's own name. */
export { basename };

/**
 * The TOLERANT per-session state schema. Only `sessionId` (the local launch UUID — our join key) is
 * REQUIRED; `bridgeSessionId` is validated separately against the strict brand. `.passthrough()`
 * keeps unknown keys, so an additive Claude-state change (a new field) does NOT break resolution —
 * the file still validates and the session still resolves (plan Decision 6). A missing/invalid
 * REQUIRED field, by contrast, fails this parse and degrades to no link + telemetry.
 */
const sessionStateEntrySchema = z
  .object({
    sessionId: z.string().min(1),
    bridgeSessionId: z.string().optional(),
  })
  .passthrough();

/**
 * The explicit breaking-case reason codes (design Decision 7) — they match the `session-web-link`
 * degradation triggers one-for-one. There is NO generic `schema-drift` reason: an unknown/additive
 * field is tolerated and emits nothing.
 */
export type SessionLinkDegradationReason =
  | 'missing-or-invalid-required-field'
  | 'bad-token'
  | 'parse-error'
  | 'size-limit'
  | 'scan-bounded';

/** Dependencies for the bounded scan — all injectable so unit tests stay off the real home. */
export interface SessionLinkResolverDeps {
  /** The fs seam (default: the real `node:fs/promises` reader). */
  fs?: SessionsFs;
  /** The sessions directory to scan (default: `~/.claude/sessions`). */
  sessionsDir?: string;
  /** Degradation telemetry sink (reason code + count only; no token/path in plain attributes). */
  telemetry?: RuntimeTelemetry;
  /** Newest-N-by-mtime scan bound — entries past it are left unread (default 64). */
  maxFiles?: number;
  /** Per-file size guard in bytes — larger files are skipped (default 64 KiB). */
  maxFileBytes?: number;
  /** Scan deadline in ms — once spent, remaining inspected files are left unread (default 250). */
  deadlineMs?: number;
  /** Monotonic clock for the deadline (default `Date.now`). */
  now?: () => number;
}

const DEFAULT_MAX_FILES = 64;
const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_DEADLINE_MS = 250;

/**
 * Build the `sessionId → bridgeSessionId` index in ONE bounded scan of the sessions dir (design
 * Decision 3 / `session-web-link`). The scan is bounded by newest-N-by-mtime + a deadline (live
 * sessions are the recent files); each inspected file gets a size guard, a tolerant JSON+Zod parse,
 * and a strict brand check on its token. Malformed/oversized files are SKIPPED rather than failing
 * the listing; only a genuine degradation (parse error, missing/invalid required field, bad token,
 * or hitting the scan bound) emits structured reason-code telemetry. An absent/unreadable dir yields
 * an empty index with no telemetry — best-effort, never load-bearing for tmux-derived liveness.
 */
export async function readSessionStateIndex(
  deps: SessionLinkResolverDeps = {},
): Promise<Map<string, BridgeSessionId>> {
  const fs = deps.fs ?? defaultSessionsFs;
  const dir = deps.sessionsDir ?? defaultSessionsDir();
  const maxFiles = deps.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = deps.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const deadlineMs = deps.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const now = deps.now ?? (() => Date.now());

  const index = new Map<string, BridgeSessionId>();
  const degraded = new Map<SessionLinkDegradationReason, number>();
  const bump = (reason: SessionLinkDegradationReason, n = 1): void => {
    degraded.set(reason, (degraded.get(reason) ?? 0) + n);
  };

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    // The sessions dir is absent or unreadable (e.g. a container that does not mount `~/.claude`):
    // degrade to an empty index with NO telemetry — liveness is unaffected (design Risks).
    return index;
  }

  // The deadline clock starts BEFORE the stat phase: selecting the newest-N by mtime requires a
  // `stat` per entry, so the stat sweep itself is O(file-count) work that a stale/huge
  // `~/.claude/sessions` could blow up. The deadline bounds that sweep too, so a large dir can never
  // delay tmux-derived liveness — un-statted entries are simply left out (no link + `scan-bounded`).
  const start = now();
  const overDeadline = (): boolean => now() - start > deadlineMs;

  // Stat each `.json` for its mtime (newest-first ordering) + byte size (the guard), until the
  // deadline is spent. A file that vanished between `readdir` and `stat` is skipped silently (not a
  // format degradation).
  const jsonNames = names.filter((name) => name.endsWith('.json'));
  const stats: { name: string; size: number; mtimeMs: number }[] = [];
  let statBounded = 0;
  for (let i = 0; i < jsonNames.length; i += 1) {
    if (overDeadline()) {
      statBounded = jsonNames.length - i; // the remaining entries are never statted (no link)
      break;
    }
    try {
      const s = await fs.stat(join(dir, jsonNames[i]));
      stats.push({ name: jsonNames[i], size: s.size, mtimeMs: s.mtimeMs });
    } catch {
      // skip — nothing to read
    }
  }
  if (statBounded > 0) bump('scan-bounded', statBounded);
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Newest-N bound: entries past N are left unread (those sessions get no link + `scan-bounded`).
  const inspect = stats.slice(0, maxFiles);
  if (stats.length > inspect.length) bump('scan-bounded', stats.length - inspect.length);

  for (let i = 0; i < inspect.length; i += 1) {
    // Deadline bound: stop once the time budget is spent; the remaining files are overflow.
    if (overDeadline()) {
      bump('scan-bounded', inspect.length - i);
      break;
    }
    const { name, size } = inspect[i];
    if (size > maxFileBytes) {
      bump('size-limit');
      continue;
    }
    let raw: string;
    try {
      raw = await fs.readFile(join(dir, name));
    } catch {
      continue; // unreadable — skip, not a format degradation
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      bump('parse-error');
      continue;
    }
    const result = sessionStateEntrySchema.safeParse(parsed);
    if (!result.success) {
      bump('missing-or-invalid-required-field');
      continue;
    }
    const { sessionId, bridgeSessionId } = result.data;
    // No bridge id yet (the bridge has not connected) is the NORMAL no-link case — not a degradation.
    if (bridgeSessionId === undefined) continue;
    const branded = bridgeSessionIdSchema.safeParse(bridgeSessionId);
    if (!branded.success) {
      bump('bad-token');
      continue;
    }
    index.set(sessionId, branded.data);
  }

  // Redaction-safe degradation telemetry (design Decision 7 / `telemetry.ts` blocklist): a reason
  // CODE + a COUNT only — never the bridge token or a file path in a plain span attribute. The
  // reason/count carry no sensitive material, so they stay visible; the `session.link.degraded`
  // span name lives under the already-blocklisted `session.*` namespace for any future context attr.
  for (const [reason, count] of degraded) {
    deps.telemetry?.startSpan('session.link.degraded', { reason, count }).end();
  }
  return index;
}

/**
 * The PURE lookup (plan Decision 5): resolve a live session's recorded launch UUID against the index
 * to its cloud bridge id, or `undefined`. Match is by recorded UUID ONLY — never `cwd` — so a stale
 * state file left in the same worktree path can never be mismatched. A missing recorded UUID (no
 * ledger metadata: a server restart, or a session launched outside Switchboard) yields no link.
 */
export function resolveBridgeSessionId(
  index: ReadonlyMap<string, BridgeSessionId>,
  launchSessionId: string | undefined,
): BridgeSessionId | undefined {
  if (launchSessionId === undefined) return undefined;
  return index.get(launchSessionId);
}
