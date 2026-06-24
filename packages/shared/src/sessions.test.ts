import { describe, expect, it } from 'vitest';
import { idForBranch } from './worktrees.js';
import {
  isValidTmuxSessionName,
  sessionLaunchRequestSchema,
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
