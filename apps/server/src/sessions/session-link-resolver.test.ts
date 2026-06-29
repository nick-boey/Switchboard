import { describe, expect, it } from 'vitest';
import { createTelemetryCapture } from '../testing/no-leak.js';
import {
  FIXTURE_IDS,
  defaultSessionStateFixtures,
  fixturesFs,
  stateFileContent,
  type SessionStateFixture,
} from '../testing/session-state-fixtures.js';
import { readSessionStateIndex, resolveBridgeSessionId } from './session-link-resolver.js';

/**
 * Bridge-id resolver tests (task 4.1, design Decision 3 / session-web-link). The resolver builds ONE
 * bounded `sessionId → bridgeSessionId` index per poll over claude's per-session state files, then a
 * pure UUID lookup resolves a live session's recorded launch UUID. These tests pin: a match resolves;
 * a non-match / bad token resolves to none; the match is by recorded UUID, never `cwd`; malformed /
 * oversized files are skipped without failing the listing; additive drift (an unknown field) still
 * resolves with NO telemetry; breaking drift (a missing/invalid required field) and a scan that hits
 * the bound degrade to no link WITH structured reason-code telemetry. The fs seam + injectable
 * sessions dir keep it off the real home.
 */

/** Build the index over a fixture set with a telemetry capture wired in (the common arrange step). */
async function indexOf(
  fixtures: readonly SessionStateFixture[],
  over: { maxFiles?: number; maxFileBytes?: number } = {},
) {
  const capture = createTelemetryCapture();
  const { fs, sessionsDir } = fixturesFs(fixtures);
  const index = await readSessionStateIndex({
    fs,
    sessionsDir,
    telemetry: capture.telemetry,
    ...over,
  });
  return { index, spans: capture.spans };
}

/** True when a degradation span carrying `reason` was emitted. */
function emittedReason(
  spans: () => { name: string; attributes: Record<string, unknown> }[],
  reason: string,
): boolean {
  return spans().some((s) => s.attributes.reason === reason);
}

describe('readSessionStateIndex + resolveBridgeSessionId', () => {
  it('resolves a live session with a matching, well-formed state entry', async () => {
    const { index } = await indexOf(defaultSessionStateFixtures());
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.matchingUuid)).toBe(
      FIXTURE_IDS.matchingBridge,
    );
  });

  it('resolves to none for a UUID with no matching entry (bridge not connected yet)', async () => {
    const { index } = await indexOf(defaultSessionStateFixtures());
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.unmatchedUuid)).toBeUndefined();
    // An undefined recorded UUID (no ledger metadata) likewise resolves to none, never a guess.
    expect(resolveBridgeSessionId(index, undefined)).toBeUndefined();
  });

  it('matches by recorded UUID, never by cwd: the stale shared-cwd entry is not confused', async () => {
    const { index } = await indexOf(defaultSessionStateFixtures());
    // Two entries share one `cwd`; each resolves to its OWN bridge by UUID — the current session's
    // UUID never picks up the stale entry's token, and vice versa.
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.sharedCwdCurrentUuid)).toBe(
      FIXTURE_IDS.sharedCwdCurrentBridge,
    );
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.sharedCwdStaleUuid)).toBe(
      FIXTURE_IDS.sharedCwdStaleBridge,
    );
  });

  it('rejects a malformed bridge token (a UUID, not session_…): no link, token never indexed', async () => {
    const { index, spans } = await indexOf(defaultSessionStateFixtures());
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.badTokenUuid)).toBeUndefined();
    expect(emittedReason(spans, 'bad-token')).toBe(true);
  });

  it('skips a malformed-JSON and an oversized file without failing the listing (others still resolve)', async () => {
    const { index, spans } = await indexOf(defaultSessionStateFixtures(), {
      maxFileBytes: 1_000_000,
    });
    // The valid entries still resolved despite the malformed + oversized siblings.
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.matchingUuid)).toBe(
      FIXTURE_IDS.matchingBridge,
    );
    expect(emittedReason(spans, 'parse-error')).toBe(true);
    expect(emittedReason(spans, 'size-limit')).toBe(true);
  });

  it('tolerates additive drift (an unknown extra field) — still resolves, emits NO telemetry', async () => {
    // Isolated set: only a valid+matching entry and an unknown-extra-field entry, both well-formed.
    const fixtures: SessionStateFixture[] = [
      {
        name: '1.json',
        mtimeMs: 10,
        content: stateFileContent({
          sessionId: FIXTURE_IDS.matchingUuid,
          bridgeSessionId: FIXTURE_IDS.matchingBridge,
        }),
      },
      {
        name: '2.json',
        mtimeMs: 9,
        content: stateFileContent({
          sessionId: FIXTURE_IDS.unknownFieldUuid,
          bridgeSessionId: FIXTURE_IDS.unknownFieldBridge,
          aFutureClaudeField: { nested: true },
        }),
      },
    ];
    const { index, spans } = await indexOf(fixtures);
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.unknownFieldUuid)).toBe(
      FIXTURE_IDS.unknownFieldBridge,
    );
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.matchingUuid)).toBe(
      FIXTURE_IDS.matchingBridge,
    );
    expect(spans()).toHaveLength(0); // additive drift is silent
  });

  it('degrades on a missing/invalid required field — no link + telemetry', async () => {
    const fixtures: SessionStateFixture[] = [
      // Missing the required `sessionId`.
      {
        name: '1.json',
        mtimeMs: 10,
        content: stateFileContent({ bridgeSessionId: 'session_01abc' }),
      },
      // `sessionId` present but the wrong type.
      {
        name: '2.json',
        mtimeMs: 9,
        content: stateFileContent({ sessionId: 12345, bridgeSessionId: 'session_01def' }),
      },
    ];
    const { index, spans } = await indexOf(fixtures);
    expect(index.size).toBe(0);
    expect(emittedReason(spans, 'missing-or-invalid-required-field')).toBe(true);
  });

  it('bounds the scan to the newest-N: overflow sessions get no link + scan-bounded telemetry', async () => {
    // 1 newest valid entry + 3 OLDER overflow entries; bound to the newest 1.
    const fixtures = defaultSessionStateFixtures({ overflowCount: 0 }).slice(0, 1); // the matching entry (newest)
    const overflow: SessionStateFixture[] = [0, 1, 2].map((i) => ({
      name: `9${i}.json`,
      mtimeMs: 1 + i, // far OLDER than the matching entry (mtime 2e12)
      content: stateFileContent({
        sessionId: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${i}`,
        bridgeSessionId: `session_01Overflow${i}`,
      }),
    }));
    const { index, spans } = await indexOf([...fixtures, ...overflow], { maxFiles: 1 });
    // Only the newest (matching) entry was inspected.
    expect(resolveBridgeSessionId(index, FIXTURE_IDS.matchingUuid)).toBe(
      FIXTURE_IDS.matchingBridge,
    );
    expect(resolveBridgeSessionId(index, 'aaaaaaaa-aaaa-4aaa-8aaa-000000000000')).toBeUndefined();
    expect(emittedReason(spans, 'scan-bounded')).toBe(true);
  });

  it('bounds the STAT phase by the deadline — does not stat every file in a huge dir before returning', async () => {
    // A large sessions dir; a fake clock that trips the deadline after a couple of stats. The resolver
    // must NOT stat all entries before returning, or a stale/huge ~/.claude/sessions would slow every
    // 4 s liveness poll (the scan must never delay tmux-derived liveness — session-web-link).
    const many: SessionStateFixture[] = Array.from({ length: 200 }, (_, i) => ({
      name: `f${String(i).padStart(4, '0')}.json`,
      mtimeMs: 1000 + i,
      content: stateFileContent({
        sessionId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
        bridgeSessionId: `session_01Many${String(i).padStart(8, '0')}`,
      }),
    }));
    const { fs: baseFs, sessionsDir } = fixturesFs(many);
    let statCount = 0;
    const fs = {
      ...baseFs,
      stat: (p: string) => {
        statCount += 1;
        return baseFs.stat(p);
      },
    };
    // Start at 1000, +100 ms per `now()` call → the 250 ms deadline is exceeded after a few stats.
    let tick = 0;
    const now = () => 1000 + tick++ * 100;
    const capture = createTelemetryCapture();
    await readSessionStateIndex({
      fs,
      sessionsDir,
      telemetry: capture.telemetry,
      deadlineMs: 250,
      now,
    });
    // Far fewer stats than the 200 files — the deadline bounded the stat phase, not just the reads.
    expect(statCount).toBeLessThan(many.length);
    expect(statCount).toBeLessThanOrEqual(5);
    expect(emittedReason(capture.spans, 'scan-bounded')).toBe(true);
  });

  it('returns an empty index (no error) when the sessions dir is absent (best-effort)', async () => {
    const capture = createTelemetryCapture();
    const { fs } = fixturesFs([]);
    // Point at a dir the fake fs does not serve → readdir rejects → empty index, never a throw.
    const index = await readSessionStateIndex({
      fs,
      sessionsDir: '/nonexistent/.claude/sessions',
      telemetry: capture.telemetry,
    });
    expect(index.size).toBe(0);
  });
});

describe('degradation telemetry is redaction-safe (task 4.3, design Decision 7)', () => {
  it('emits a reason code + count ONLY — never the bridge token or a file path in a plain attribute', async () => {
    const malformedToken = '016iJ8uvtLucRZJ8hiAqpeor';
    const cwdPath = '/Users/someone/work/repos/acme/widget/worktrees/feature-x--0123456789ab';
    // The capture runs the production `redactAttributes`, so this asserts exactly what an exporter
    // would see, not the raw values handed in.
    const capture = createTelemetryCapture();
    const { fs, sessionsDir } = fixturesFs([
      {
        name: '1.json',
        mtimeMs: 10,
        content: stateFileContent({
          sessionId: FIXTURE_IDS.badTokenUuid,
          bridgeSessionId: malformedToken,
          cwd: cwdPath,
        }),
      },
    ]);
    await readSessionStateIndex({ fs, sessionsDir, telemetry: capture.telemetry });

    const degradations = capture.spans().filter((s) => s.name === 'session.link.degraded');
    expect(degradations).toHaveLength(1);
    const span = degradations[0];
    expect(span.attributes.reason).toBe('bad-token');
    expect(span.attributes.count).toBe(1);
    // The attribute set is EXACTLY {reason, count} — nothing else rides along.
    expect(Object.keys(span.attributes).sort()).toEqual(['count', 'reason']);
    // Neither the malformed token nor the worktree path appears anywhere in the captured spans.
    expect(capture.containsSecret(malformedToken)).toBe(false);
    expect(capture.containsSecret(cwdPath)).toBe(false);
  });
});
