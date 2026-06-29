import { describe, expect, it } from 'vitest';
import { idForBranch } from './worktrees.js';
import {
  bridgeSessionIdSchema,
  isTerminalLaunchState,
  isValidTmuxSessionName,
  sessionDisplayName,
  sessionLaunchRequestSchema,
  sessionLaunchStatusSchema,
  sessionListResponseSchema,
  sessionStopRequestSchema,
  sessionSummarySchema,
  tmuxSessionName,
} from './sessions.js';

/**
 * Shared session contracts (task 2.1, design Decision 1). `tmuxSessionName` reuses the canonical
 * `slugForBranch` + `sha256Hex` primitives (the same single source of truth behind `idForBranch`)
 * over `(repo-id, wt-id)`: deterministic, tmux-safe, `sb-`-prefixed, distinct for the same branch
 * across repos, stable per pair, and forward-derived only. The request/response schemas parse valid
 * input and reject malformed `<repo-id>`/`<wt-id>`.
 */
describe('tmuxSessionName', () => {
  const repoId = 'acme/widget-factory';
  const wtId = idForBranch('feature/login');

  it('is deterministic for the same (repoId, wtId)', () => {
    expect(tmuxSessionName(repoId, wtId)).toBe(tmuxSessionName(repoId, wtId));
  });

  it('carries the sb- prefix', () => {
    expect(tmuxSessionName(repoId, wtId).startsWith('sb-')).toBe(true);
  });

  it('is tmux-safe: no ".", ":", "/", or whitespace', () => {
    // A branch whose slug would otherwise carry a reserved "." (tmux window.pane separator).
    const dotted = idForBranch('release/2.0.1');
    const name = tmuxSessionName('acme.org/some.repo', dotted);
    expect(name).not.toMatch(/[.:/\s]/);
    expect(isValidTmuxSessionName(name)).toBe(true);
  });

  it('is distinct for the same branch in different repos (function of repoId+wtId, not wtId alone)', () => {
    // Same branch → same <wt-id> across two repos; the names must still differ.
    const a = tmuxSessionName('acme/one', wtId);
    const b = tmuxSessionName('acme/two', wtId);
    expect(a).not.toBe(b);
  });

  it('is stable across many derivations of the same pair', () => {
    const first = tmuxSessionName(repoId, wtId);
    for (let i = 0; i < 5; i += 1) expect(tmuxSessionName(repoId, wtId)).toBe(first);
  });
});

/**
 * The human-readable Claude display name (task 2.1, design Decision 1). `sessionDisplayName` composes
 * `<repo>/<branch-slug>` — the repository NAME (the `<repo-id>` segment after the owner) plus the
 * `<wt-id>` with only its trailing `--<hash>` removed. Forward-derived and lossy: the same branch
 * across differently-named repos stays distinct (the repo name is folded in), while two ids that
 * resolve to the same `<repo>/<slug>` — same repo name under different owners, or branches whose slugs
 * coincide — deterministically share a name (owner-crossing and the dropped hash are accepted).
 */
describe('sessionDisplayName', () => {
  it('composes <repo>/<slug>: repo name + the <wt-id> with only its trailing --<hash> stripped', () => {
    expect(sessionDisplayName('acme/widget-factory', 'name-sessions--7130389dc45a')).toBe(
      'widget-factory/name-sessions',
    );
    // The strip removes ONLY the trailing 12-hex hash, never an interior `-` of the slug.
    expect(sessionDisplayName('acme/my-repo', 'release-2-0--0123456789ab')).toBe(
      'my-repo/release-2-0',
    );
  });

  it('keeps the same branch distinct across differently-named repos (folds in the repo name)', () => {
    const wtId = idForBranch('main'); // a function of the branch alone → identical across repos
    expect(sessionDisplayName('acme/a', wtId)).toBe('a/main');
    expect(sessionDisplayName('acme/b', wtId)).toBe('b/main');
    expect(sessionDisplayName('acme/a', wtId)).not.toBe(sessionDisplayName('acme/b', wtId));
  });

  it('accepts the owner-crossing collision: same repo name under different owners → same name', () => {
    const wtId = idForBranch('main');
    expect(sessionDisplayName('acme/widget', wtId)).toBe('widget/main');
    expect(sessionDisplayName('other/widget', wtId)).toBe('widget/main');
    expect(sessionDisplayName('acme/widget', wtId)).toBe(sessionDisplayName('other/widget', wtId));
  });

  it('accepts the same-repo slug collision: two <wt-id>s that strip to the same slug → same name', () => {
    // Case-folding branch pairs slugify identically but carry distinct hashes (idForBranch hashes the
    // exact branch); stripping the hash collapses them to one deterministic name.
    const a = idForBranch('Feature/Login');
    const b = idForBranch('feature/login');
    expect(a).not.toBe(b); // distinct <wt-id>s (distinct hashes)
    expect(sessionDisplayName('acme/widget', a)).toBe('widget/feature-login');
    expect(sessionDisplayName('acme/widget', b)).toBe('widget/feature-login');
  });
});

describe('isValidTmuxSessionName', () => {
  it('accepts a forward-derived name', () => {
    expect(isValidTmuxSessionName(tmuxSessionName('acme/infra', idForBranch('feature/x')))).toBe(
      true,
    );
  });

  it('rejects malformed names (missing prefix, reserved chars, no hash)', () => {
    expect(isValidTmuxSessionName('feature-x--0123456789ab')).toBe(false); // no sb- prefix
    expect(isValidTmuxSessionName('sb-feature.x--0123456789ab')).toBe(false); // reserved "."
    expect(isValidTmuxSessionName('sb-feature:x--0123456789ab')).toBe(false); // reserved ":"
    expect(isValidTmuxSessionName('sb-feature/x--0123456789ab')).toBe(false); // "/"
    expect(isValidTmuxSessionName('sb-feature-x')).toBe(false); // no --<12hex>
    expect(isValidTmuxSessionName('sb-feature-x--xyz')).toBe(false); // hash not 12 hex
  });
});

describe('session request/response schemas', () => {
  const repoId = 'acme/widget-factory';
  const wtId = idForBranch('feature/login');

  it('launch/stop schemas parse a valid (repoId, wtId)', () => {
    expect(sessionLaunchRequestSchema.safeParse({ repoId, wtId }).success).toBe(true);
    expect(sessionStopRequestSchema.safeParse({ repoId, wtId }).success).toBe(true);
  });

  it('launch/stop schemas reject a malformed repoId', () => {
    expect(sessionLaunchRequestSchema.safeParse({ repoId: 'no-slash', wtId }).success).toBe(false);
    expect(sessionStopRequestSchema.safeParse({ repoId: '../escape', wtId }).success).toBe(false);
  });

  it('launch/stop schemas reject a malformed wtId', () => {
    expect(sessionLaunchRequestSchema.safeParse({ repoId, wtId: 'no-hash' }).success).toBe(false);
    expect(
      sessionStopRequestSchema.safeParse({ repoId, wtId: '../etc--0123456789ab' }).success,
    ).toBe(false);
  });

  it('the list response carries existence + worktree mapping only (status on)', () => {
    const parsed = sessionListResponseSchema.safeParse({
      repoId,
      sessions: [{ repoId, wtId, status: 'on' }],
    });
    expect(parsed.success).toBe(true);
    // A summary rejects any conversation-metadata field (existence + mapping only).
    expect(sessionSummarySchema.safeParse({ repoId, wtId, status: 'on' }).success).toBe(true);
    expect(sessionSummarySchema.safeParse({ repoId, wtId, status: 'off' }).success).toBe(false);
  });
});

describe('bridgeSessionId branded token (session-web-link Decision 5/8)', () => {
  const repoId = 'acme/widget-factory';
  const wtId = idForBranch('feature/login');
  const validBridge = 'session_011M7D8EPisCss4xNqQ4PNiQ';

  it('accepts a well-formed session_… token', () => {
    expect(bridgeSessionIdSchema.safeParse(validBridge).success).toBe(true);
    expect(bridgeSessionIdSchema.safeParse('session_016iJ8uvtLucRZJ8hiAqpeor').success).toBe(true);
  });

  it('rejects a UUID, empty, and the wrong shape (the strict allowlist)', () => {
    // The local launch UUID is a DIFFERENT namespace — it must never pass the bridge brand.
    expect(bridgeSessionIdSchema.safeParse('42ec9f7f-0000-4000-8000-000000000000').success).toBe(
      false,
    );
    expect(bridgeSessionIdSchema.safeParse('').success).toBe(false);
    expect(bridgeSessionIdSchema.safeParse('session_').success).toBe(false); // no token body
    expect(bridgeSessionIdSchema.safeParse('016iJ8uvtLucRZJ8hiAqpeor').success).toBe(false); // no prefix
    expect(bridgeSessionIdSchema.safeParse('session_has-a-dash').success).toBe(false); // non-base62
    expect(bridgeSessionIdSchema.safeParse('Session_Uppercased1').success).toBe(false); // wrong prefix case
  });

  it('is an optional field on the session summary (present when resolved, absent otherwise)', () => {
    // Absent → still a valid live-session summary (the bridge has not resolved yet).
    expect(sessionSummarySchema.safeParse({ repoId, wtId, status: 'on' }).success).toBe(true);
    // Present + brand-valid → valid.
    expect(
      sessionSummarySchema.safeParse({ repoId, wtId, status: 'on', bridgeSessionId: validBridge })
        .success,
    ).toBe(true);
    // Present but brand-invalid → rejected (the server never hands an unbranded token to the web).
    expect(
      sessionSummarySchema.safeParse({
        repoId,
        wtId,
        status: 'on',
        bridgeSessionId: 'not-a-bridge-id',
      }).success,
    ).toBe(false);
  });
});

describe('session launch status schema (distinct from the clone OperationStatus)', () => {
  const repoId = 'session/acme/widget-factory/feature-login--0123456789ab';

  it('accepts the session launch states and typed SESSION failure kinds', () => {
    for (const status of ['starting', 'ready', 'error', 'aborted'] as const) {
      expect(
        sessionLaunchStatusSchema.safeParse({ repoId, operationId: 'op-1', status }).success,
      ).toBe(true);
    }
    for (const kind of ['no-worktree', 'tmux-failure', 'launch-failed'] as const) {
      expect(
        sessionLaunchStatusSchema.safeParse({
          repoId,
          operationId: 'op-1',
          status: 'error',
          error: { kind },
        }).success,
      ).toBe(true);
    }
  });

  it('rejects the clone vocabulary (`cloning` state, `git-failure` kind)', () => {
    expect(
      sessionLaunchStatusSchema.safeParse({ repoId, operationId: 'op-1', status: 'cloning' })
        .success,
    ).toBe(false);
    expect(
      sessionLaunchStatusSchema.safeParse({
        repoId,
        operationId: 'op-1',
        status: 'error',
        error: { kind: 'git-failure' },
      }).success,
    ).toBe(false);
  });

  it('isTerminalLaunchState is true for every settled state, false for the in-flight transient', () => {
    expect(isTerminalLaunchState('starting')).toBe(false);
    expect(isTerminalLaunchState('ready')).toBe(true);
    expect(isTerminalLaunchState('error')).toBe(true);
    expect(isTerminalLaunchState('aborted')).toBe(true);
  });
});
