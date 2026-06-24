import { describe, expect, it } from 'vitest';
import { deriveSessionStatus, plugToggleAction, sessionStatusToPlug } from './session-model';

/**
 * Pure session→plug-status model tests (task 9.1, design Decision 5). The session status is derived
 * from tmux liveness (the next read) plus the in-flight/failed launch state, mapped to the plug's
 * visual, and the toggle action follows the status. The mapping self-corrects from tmux truth: once
 * no mutation is pending, the status is re-derived purely from `live`.
 */
describe('deriveSessionStatus', () => {
  it('off when there is no live session and nothing pending/failed', () => {
    expect(deriveSessionStatus({ live: false, pending: false, failed: false })).toBe('off');
  });

  it('on when a live session exists', () => {
    expect(deriveSessionStatus({ live: true, pending: false, failed: false })).toBe('on');
  });

  it('starting (optimistic transient) while a launch/stop mutation is in flight', () => {
    expect(deriveSessionStatus({ live: false, pending: true, failed: false })).toBe('starting');
    // Pending wins over a stale live/failed reading (optimistic during the mutation).
    expect(deriveSessionStatus({ live: true, pending: true, failed: true })).toBe('starting');
  });

  it('error when the last launch/stop failed (and nothing is pending)', () => {
    expect(deriveSessionStatus({ live: false, pending: false, failed: true })).toBe('error');
  });

  it('self-corrects from tmux truth: a killed session reads off on the next read', () => {
    // Previously "on", session killed externally → next liveness read has live=false, no pending.
    expect(deriveSessionStatus({ live: false, pending: false, failed: false })).toBe('off');
  });
});

describe('deriveSessionStatus with a tracked launch op (polled after the POST resolves)', () => {
  it('stays starting while the tracked launch op is still starting, even though no POST is pending', () => {
    // The launch POST resolved (pending=false) but the launch is still running (op `starting`): the
    // plug must remain the guarded transient, not fall back to liveness-only `off`.
    expect(
      deriveSessionStatus({ live: false, pending: false, failed: false, launchOp: 'starting' }),
    ).toBe('starting');
  });

  it('surfaces error when the tracked launch op resolved to a typed failure (NOT off)', () => {
    // An asynchronous launch failure after the POST resolved → the plug shows error, not off.
    expect(
      deriveSessionStatus({ live: false, pending: false, failed: false, launchOp: 'error' }),
    ).toBe('error');
  });

  it('a ready launch op defers to tmux liveness (on when live, off when not)', () => {
    expect(
      deriveSessionStatus({ live: true, pending: false, failed: false, launchOp: 'ready' }),
    ).toBe('on');
    expect(
      deriveSessionStatus({ live: false, pending: false, failed: false, launchOp: 'ready' }),
    ).toBe('off');
  });
});

describe('sessionStatusToPlug', () => {
  it('maps each session status to its plug visual', () => {
    expect(sessionStatusToPlug('off')).toBe('off');
    expect(sessionStatusToPlug('starting')).toBe('working');
    expect(sessionStatusToPlug('on')).toBe('running');
    expect(sessionStatusToPlug('error')).toBe('error');
  });
});

describe('plugToggleAction', () => {
  it('off launches, on/error stops, starting is guarded', () => {
    expect(plugToggleAction('off')).toBe('launch');
    expect(plugToggleAction('on')).toBe('stop');
    expect(plugToggleAction('error')).toBe('stop');
    expect(plugToggleAction('starting')).toBeNull();
  });
});
