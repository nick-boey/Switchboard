import { describe, expect, it } from 'vitest';
import { canCreateWorktree, isWorktreeSafeToDelete, prLampStatus } from './worktree-model';

/**
 * Failing-first tests (task 7.1) for the worktrees-hub UI model. The headline assertion is the
 * MVP-dormant safe-to-delete state: with no PR-status source, prMerged is undefined for every
 * worktree, so none is ever presented as safe and the delete control always confirms.
 */
describe('isWorktreeSafeToDelete (dormant in the MVP)', () => {
  it('is never safe when prMerged is unset (the MVP case)', () => {
    expect(isWorktreeSafeToDelete({ dirty: false })).toBe(false);
    expect(isWorktreeSafeToDelete({ dirty: false, prMerged: false })).toBe(false);
  });

  it('becomes safe only once a PR source sets prMerged on a clean worktree', () => {
    expect(isWorktreeSafeToDelete({ dirty: false, prMerged: true })).toBe(true);
    expect(isWorktreeSafeToDelete({ dirty: true, prMerged: true })).toBe(false);
  });
});

describe('prLampStatus (display-only)', () => {
  it('maps the absent merged-PR flag to none', () => {
    expect(prLampStatus({})).toBe('none');
    expect(prLampStatus({ prMerged: false })).toBe('none');
    expect(prLampStatus({ prMerged: true })).toBe('merged');
  });
});

describe('canCreateWorktree', () => {
  it('enables only a valid, non-empty, safe branch', () => {
    expect(canCreateWorktree({ mode: 'new', branch: 'feature/x' })).toBe(true);
    expect(canCreateWorktree({ mode: 'existing-remote', branch: 'main' })).toBe(true);
    expect(canCreateWorktree({ mode: 'new', branch: '' })).toBe(false);
    expect(canCreateWorktree({ mode: 'new', branch: '   ' })).toBe(false);
    expect(canCreateWorktree({ mode: 'new', branch: 'a\tb' })).toBe(false);
  });
});
