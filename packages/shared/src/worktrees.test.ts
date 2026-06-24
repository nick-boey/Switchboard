import { describe, expect, it } from 'vitest';
import {
  idForBranch,
  isValidWorktreeId,
  slugForBranch,
  sha256Hex,
  worktreeCreateRequestSchema,
  worktreeDeleteRequestSchema,
  worktreeListResponseSchema,
  worktreeSummarySchema,
} from './worktrees';

/**
 * Failing-first tests (tasks 2.1 + 2.2) for the canonical path-safe ID scheme and the worktree
 * Zod contracts. The ID scheme is the cross-change keystone (claude-session-launch reuses it),
 * so the corpus is adversarial: traversal, slashes, spaces, Unicode/emoji, reserved/empty slug,
 * excessive length, and case-folding pairs. The proof of collision-resistance is **distinct
 * hashes** across distinct branches, not a claim of impossibility.
 */

// --- ID scheme (task 2.1) ---------------------------------------------------

describe('idForBranch / isValidWorktreeId (canonical path-safe id)', () => {
  const ID = /^[a-z0-9][a-z0-9._-]*--[0-9a-f]{12}$/;

  it('produces a recognisable, path-safe id for a simple branch', () => {
    const id = idForBranch('feature/remote-control');
    expect(id).toMatch(ID);
    expect(isValidWorktreeId(id)).toBe(true);
    // The slug recognisably reflects the branch (the `/` folds to `-`).
    expect(id.startsWith('feature-remote-control--')).toBe(true);
  });

  // Adversarial branch names → still a valid, path-safe, non-empty id.
  const adversarial: Array<[string, string]> = [
    ['with a slash', 'feature/foo'],
    ['traversal ../x', '../x'],
    ['just dotdot', '..'],
    ['single dot', '.'],
    ['reserved .git', '.git'],
    ['double dot inside', 'a..b'],
    ['spaces', 'my cool branch'],
    ['unicode', 'función/ámbar'],
    ['emoji only', '🚀🔥'],
    ['leading/trailing junk', '---weird...'],
    ['excessively long', 'feature/' + 'x'.repeat(300)],
    ['control chars', 'a\tb\nc'],
    ['backslashes and colons', 'a\\b:c?d*e'],
  ];

  for (const [label, branch] of adversarial) {
    it(`derives a valid path-safe id for an adversarial name (${label})`, () => {
      const id = idForBranch(branch);
      expect(id.length).toBeGreaterThan(0);
      expect(isValidWorktreeId(id)).toBe(true);
      expect(id).toMatch(ID);
      // No traversal segment and no out-of-charset character escapes the id.
      expect(id).not.toContain('/');
      expect(id).not.toContain('..');
      expect(id).not.toContain('\\');
      // Within filesystem + tmux name-length limits (slug capped at 48 + `--` + 12 hex).
      expect(id.length).toBeLessThanOrEqual(48 + 2 + 12);
    });
  }

  it('falls the slug back to a fixed token when transliteration is empty', () => {
    for (const branch of ['..', '.', '🚀🔥', '   ', '///']) {
      expect(idForBranch(branch).startsWith('wt--')).toBe(true);
    }
  });

  it('is deterministic — same branch yields the same id twice', () => {
    expect(idForBranch('release/2.0')).toBe(idForBranch('release/2.0'));
  });

  it('produces distinct ids for distinct branches across the corpus (collision-resistant)', () => {
    const branches = [
      ...new Set([
        'main',
        'feature/bar',
        'feature/foo-2',
        'release/1.0',
        'release/2.0',
        'fix/clone-retry',
        ...adversarial.map(([, b]) => b),
      ]),
    ];
    const ids = branches.map(idForBranch);
    expect(new Set(ids).size).toBe(ids.length);
    // The proof is distinct HASH suffixes, not just distinct slugs.
    const hashes = branches.map((b) => sha256Hex(b).slice(0, 12));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('distinguishes case-folding pairs by the hash over raw branch bytes', () => {
    const upper = idForBranch('Feature/X');
    const lower = idForBranch('feature/x');
    expect(upper).not.toBe(lower);
    // The slugs fold to the same lowercase head, so the HASH is what separates them.
    expect(upper.split('--')[0]).toBe(lower.split('--')[0]);
    expect(upper.split('--')[1]).not.toBe(lower.split('--')[1]);
  });

  it('computes SHA-256 correctly (known vector locks the hash)', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('slugForBranch round-trips the recognisable head', () => {
    expect(slugForBranch('feature/remote-control')).toBe('feature-remote-control');
    expect(slugForBranch('Release/2.0')).toBe('release/2.0'.replace('/', '-'));
  });

  it('isValidWorktreeId rejects unsafe shapes', () => {
    expect(isValidWorktreeId('feature/foo--0123456789ab')).toBe(false); // slash
    expect(isValidWorktreeId('UPPER--0123456789ab')).toBe(false); // uppercase
    expect(isValidWorktreeId('..--0123456789ab')).toBe(false); // traversal
    expect(isValidWorktreeId('a..b--0123456789ab')).toBe(false); // embedded ..
    expect(isValidWorktreeId('-lead--0123456789ab')).toBe(false); // leading separator
    expect(isValidWorktreeId('noslug')).toBe(false); // no hash
    expect(isValidWorktreeId('slug--XYZ')).toBe(false); // bad hash
    expect(isValidWorktreeId('slug--0123456789abc')).toBe(false); // hash too long
    expect(isValidWorktreeId('')).toBe(false);
  });
});

// --- Schemas (task 2.2) -----------------------------------------------------

describe('worktreeCreateRequestSchema', () => {
  it('accepts a valid existing-remote create', () => {
    const r = worktreeCreateRequestSchema.safeParse({
      repoId: 'acme/widget-factory',
      branch: 'feature/remote-control',
      mode: 'existing-remote',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a valid new-branch create with a base', () => {
    const r = worktreeCreateRequestSchema.safeParse({
      repoId: 'acme/widget-factory',
      branch: 'feature/new',
      mode: 'new',
      base: 'main',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a malformed repoId', () => {
    expect(
      worktreeCreateRequestSchema.safeParse({
        repoId: '../evil',
        branch: 'x',
        mode: 'new',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty or unsafe branch', () => {
    expect(
      worktreeCreateRequestSchema.safeParse({
        repoId: 'acme/widget',
        branch: '',
        mode: 'new',
      }).success,
    ).toBe(false);
    expect(
      worktreeCreateRequestSchema.safeParse({
        repoId: 'acme/widget',
        branch: '   ',
        mode: 'new',
      }).success,
    ).toBe(false);
    // A control character is unsafe.
    expect(
      worktreeCreateRequestSchema.safeParse({
        repoId: 'acme/widget',
        branch: 'a\tb',
        mode: 'new',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown mode', () => {
    expect(
      worktreeCreateRequestSchema.safeParse({
        repoId: 'acme/widget',
        branch: 'x',
        mode: 'sideways',
      }).success,
    ).toBe(false);
  });
});

describe('worktreeSummarySchema + worktreeListResponseSchema', () => {
  it('accepts a fully-populated worktree summary', () => {
    const r = worktreeSummarySchema.safeParse({
      wtId: 'feature-x--0123456789ab',
      branch: 'feature/x',
      path: 'worktrees/feature-x--0123456789ab',
      dirty: true,
      sync: 'ahead',
      prMerged: false,
    });
    expect(r.success).toBe(true);
  });

  it('treats prMerged as optional (dormant in the MVP)', () => {
    const r = worktreeSummarySchema.safeParse({
      wtId: 'feature-x--0123456789ab',
      branch: 'feature/x',
      path: 'worktrees/feature-x--0123456789ab',
      dirty: false,
      sync: 'up-to-date',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown sync state', () => {
    expect(
      worktreeSummarySchema.safeParse({
        wtId: 'x--0123456789ab',
        branch: 'x',
        path: 'p',
        dirty: false,
        sync: 'sideways',
      }).success,
    ).toBe(false);
  });

  it('accepts a list response', () => {
    const r = worktreeListResponseSchema.safeParse({
      repoId: 'acme/widget',
      worktrees: [],
    });
    expect(r.success).toBe(true);
  });
});

describe('worktreeDeleteRequestSchema', () => {
  it('accepts a valid delete with an optional force flag', () => {
    expect(
      worktreeDeleteRequestSchema.safeParse({
        repoId: 'acme/widget',
        wtId: 'feature-x--0123456789ab',
        force: true,
      }).success,
    ).toBe(true);
    expect(
      worktreeDeleteRequestSchema.safeParse({
        repoId: 'acme/widget',
        wtId: 'feature-x--0123456789ab',
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed repoId or wtId', () => {
    expect(
      worktreeDeleteRequestSchema.safeParse({ repoId: '../evil', wtId: 'x--0123456789ab' }).success,
    ).toBe(false);
    expect(
      worktreeDeleteRequestSchema.safeParse({ repoId: 'acme/widget', wtId: 'bad id' }).success,
    ).toBe(false);
  });
});
