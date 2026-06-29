import { basename, type SessionsFs } from '../sessions/session-link-resolver.js';

/**
 * Per-session state-file fixtures (task 1.1) for the bridge-id resolver tests. Claude writes
 * `~/.claude/sessions/<pid>.json` per session; the resolver must tolerate additive drift, degrade
 * observably on breaking drift, and bound its scan. These helpers build an IN-MEMORY `SessionsFs`
 * (task 1.2's seam) over a set of fixture entries with FULLY CONTROLLED modification times and byte
 * sizes — so the newest-N ordering, the deadline, and the per-file size guard are deterministic
 * without touching the real home or relying on git-preserved mtimes.
 *
 * The default fixture set covers every branch the resolver tests exercise: a valid+matching entry,
 * two entries sharing one `cwd` (one stale), a malformed-JSON file, an oversized file, an
 * unknown-extra-field entry (required fields valid), a missing-required-field entry, a bad-token
 * entry, and a large overflow set spanning a range of mtimes.
 */

/** A single fixture state file: name, raw contents, controlled mtime, and an optional size override. */
export interface SessionStateFixture {
  /** File name within the sessions dir (e.g. `4321.json`). */
  name: string;
  /** Raw file contents — may be deliberately invalid JSON for the malformed case. */
  content: string;
  /** Modification time in ms; controls the newest-N-by-mtime scan order. */
  mtimeMs: number;
  /** Byte-size override (defaults to the content's UTF-8 length) for the oversized-file case. */
  size?: number;
}

/** Serialise a per-session state entry; extra keys model additive Claude-state drift. */
export function stateFileContent(
  fields: {
    sessionId?: unknown;
    bridgeSessionId?: unknown;
    cwd?: string;
    status?: string;
  } & Record<string, unknown>,
): string {
  return JSON.stringify(fields);
}

/** The default sessions-dir path the fake fs answers to (a logical path — nothing on disk). */
export const FIXTURE_SESSIONS_DIR = '/fake-home/.claude/sessions';

/**
 * Build an in-memory `SessionsFs` over the given fixtures. `readdir` lists exactly the fixture
 * names for `FIXTURE_SESSIONS_DIR` (and rejects any other dir, like a missing real home);
 * `stat`/`readFile` answer per file by basename, rejecting unknown names with an ENOENT-shaped error.
 */
export function fixturesFs(
  fixtures: readonly SessionStateFixture[],
  dir = FIXTURE_SESSIONS_DIR,
): { fs: SessionsFs; sessionsDir: string } {
  const byName = new Map(fixtures.map((f) => [f.name, f]));
  const enoent = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), { code: 'ENOENT' });
  const fs: SessionsFs = {
    readdir: async (d) => {
      if (d !== dir) throw enoent(d);
      return fixtures.map((f) => f.name);
    },
    stat: async (path) => {
      const f = byName.get(basename(path));
      if (!f) throw enoent(path);
      return { mtimeMs: f.mtimeMs, size: f.size ?? Buffer.byteLength(f.content) };
    },
    readFile: async (path) => {
      const f = byName.get(basename(path));
      if (!f) throw enoent(path);
      return f.content;
    },
  };
  return { fs, sessionsDir: dir };
}

/** Stable UUIDs + bridge tokens the resolver tests assert against (named for readability). */
export const FIXTURE_IDS = {
  /** A live session with a well-formed, matching state entry. */
  matchingUuid: '11111111-1111-4111-8111-111111111111',
  matchingBridge: 'session_011MatchingBridgeId01',
  /** The current session in the shared-cwd pair (must win over the stale one). */
  sharedCwdCurrentUuid: '22222222-2222-4222-8222-222222222222',
  sharedCwdCurrentBridge: 'session_01CurrentSharedCwd9',
  /** The stale prior-launch session in the shared-cwd pair (same `cwd`, must be ignored). */
  sharedCwdStaleUuid: '33333333-3333-4333-8333-333333333333',
  sharedCwdStaleBridge: 'session_01StaleSharedCwd99',
  /** An entry whose required fields are valid but carries an unknown extra field (additive drift). */
  unknownFieldUuid: '44444444-4444-4444-8444-444444444444',
  unknownFieldBridge: 'session_01UnknownExtraFld1',
  /** An entry whose `bridgeSessionId` token is malformed (a UUID, not `session_…`). */
  badTokenUuid: '55555555-5555-4555-8555-555555555555',
  /** A live UUID with NO state entry at all (the bridge has not connected yet). */
  unmatchedUuid: '66666666-6666-4666-8666-666666666666',
} as const;

/**
 * The default fixture set (task 1.1). `overflowCount` appends that many extra valid entries with
 * mtimes OLDER than every named entry, to exercise the newest-N scan bound (those overflow sessions
 * must get no link + `scan-bounded` telemetry). The named entries carry the NEWEST mtimes so they
 * survive any reasonable bound.
 */
export function defaultSessionStateFixtures({
  overflowCount = 0,
}: { overflowCount?: number } = {}): SessionStateFixture[] {
  const newest = 2_000_000_000_000;
  const sharedCwd = '/work/repos/acme/widget-factory/worktrees/feature-login--0123456789ab';
  const fixtures: SessionStateFixture[] = [
    {
      name: '1001.json',
      mtimeMs: newest,
      content: stateFileContent({
        sessionId: FIXTURE_IDS.matchingUuid,
        bridgeSessionId: FIXTURE_IDS.matchingBridge,
        cwd: '/work/repos/acme/widget-factory/worktrees/feature-x--0123456789ab',
        status: 'connected',
      }),
    },
    // Two entries sharing one `cwd`: the stale prior launch (older) and the current one (newer).
    {
      name: '1002.json',
      mtimeMs: newest - 1,
      content: stateFileContent({
        sessionId: FIXTURE_IDS.sharedCwdCurrentUuid,
        bridgeSessionId: FIXTURE_IDS.sharedCwdCurrentBridge,
        cwd: sharedCwd,
        status: 'connected',
      }),
    },
    {
      name: '1003.json',
      mtimeMs: newest - 2,
      content: stateFileContent({
        sessionId: FIXTURE_IDS.sharedCwdStaleUuid,
        bridgeSessionId: FIXTURE_IDS.sharedCwdStaleBridge,
        cwd: sharedCwd,
        status: 'disconnected',
      }),
    },
    // Additive drift: an unknown extra field with otherwise-valid required fields → still resolves.
    {
      name: '1004.json',
      mtimeMs: newest - 3,
      content: stateFileContent({
        sessionId: FIXTURE_IDS.unknownFieldUuid,
        bridgeSessionId: FIXTURE_IDS.unknownFieldBridge,
        cwd: '/work/repos/acme/widget-factory/worktrees/feature-y--0123456789ab',
        status: 'connected',
        // A field claude added in a later version — must be ignored, no telemetry.
        someNewClaudeField: { nested: true, version: 7 },
      }),
    },
    // Breaking drift: a missing required field (`sessionId` absent) → degrades + telemetry.
    {
      name: '1005.json',
      mtimeMs: newest - 4,
      content: stateFileContent({
        bridgeSessionId: 'session_01MissingRequired9',
        cwd: '/work/repos/acme/widget-factory/worktrees/feature-z--0123456789ab',
        status: 'connected',
      }),
    },
    // A malformed bridge token (a UUID, not `session_…`) → degrades + telemetry, no link.
    {
      name: '1006.json',
      mtimeMs: newest - 5,
      content: stateFileContent({
        sessionId: FIXTURE_IDS.badTokenUuid,
        bridgeSessionId: '016iJ8uvtLucRZJ8hiAqpeor',
        cwd: '/work/repos/acme/widget-factory/worktrees/feature-w--0123456789ab',
        status: 'connected',
      }),
    },
    // Unparseable JSON → skipped with telemetry, listing unaffected.
    { name: '1007.json', mtimeMs: newest - 6, content: '{ this is not json' },
    // An oversized file → skipped with telemetry (size override exceeds any sane per-file guard).
    {
      name: '1008.json',
      mtimeMs: newest - 7,
      size: 50_000_000,
      content: stateFileContent({
        sessionId: '77777777-7777-4777-8777-777777777777',
        bridgeSessionId: 'session_01OversizedFileX9',
      }),
    },
  ];
  for (let i = 0; i < overflowCount; i += 1) {
    // Overflow entries are OLDER than every named entry, so the newest-N bound excludes them first.
    fixtures.push({
      name: `9${String(i).padStart(3, '0')}.json`,
      mtimeMs: 1_000_000_000_000 + i,
      content: stateFileContent({
        sessionId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
        bridgeSessionId: `session_01Overflow${String(i).padStart(8, '0')}`,
      }),
    });
  }
  return fixtures;
}
