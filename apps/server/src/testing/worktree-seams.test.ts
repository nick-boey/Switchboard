import { describe, expect, it } from 'vitest';
import { noPrStatusProbe, noSessionProbe } from '../worktrees/seams.js';
import { fakePrStatusProbe, fakeSessionProbe } from './worktree-seams.js';

/**
 * Smoke test for the safe-to-delete seam fakes (task 1.2): the production defaults degrade safely
 * (no session, PR unmerged) and the fakes are independently controllable per worktree.
 */
describe('safe-to-delete seam fakes (test infrastructure)', () => {
  it('degrade-safe production defaults treat every worktree as idle + unmerged', () => {
    expect(noSessionProbe.hasActiveSession('acme/widget', 'wt-a--abc')).toBe(false);
    expect(noPrStatusProbe.isPrMerged('acme/widget', 'wt-a--abc')).toBe(false);
  });

  it('session fake is controllable per worktree', () => {
    const probe = fakeSessionProbe();
    expect(probe.hasActiveSession('acme/widget', 'wt-a--abc')).toBe(false);
    probe.setActiveSession('acme/widget', 'wt-a--abc', true);
    expect(probe.hasActiveSession('acme/widget', 'wt-a--abc')).toBe(true);
    // Independent worktrees are unaffected.
    expect(probe.hasActiveSession('acme/widget', 'wt-b--def')).toBe(false);
  });

  it('pr-status fake is controllable per worktree', () => {
    const probe = fakePrStatusProbe();
    expect(probe.isPrMerged('acme/widget', 'wt-a--abc')).toBe(false);
    probe.setMerged('acme/widget', 'wt-a--abc', true);
    expect(probe.isPrMerged('acme/widget', 'wt-a--abc')).toBe(true);
    expect(probe.isPrMerged('acme/widget', 'wt-b--def')).toBe(false);
  });
});
