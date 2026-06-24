import { describe, expect, it } from 'vitest';
import type { SessionLaunchState } from '@switchboard/shared';
import { deriveSessionStatus } from './session-model';
import {
  launchOpFor,
  noLaunchTracking,
  settleLaunch,
  trackLaunch,
  trackedLaunchIds,
  untrackLaunch,
} from './session-launch-tracking';

/**
 * Per-worktree launch-op tracking (impl review of claude-session-launch, Decision 5). Every
 * worktree plug is independently actionable, so a user can start launch A then launch B before A
 * settles. A SINGLE tracked launch op (the old `launchingWtId`) could only hold the last action,
 * so the earlier launch lost its `starting`/`error` status and fell back to tmux liveness — an
 * async failure on the untracked launch then read `off` instead of the required `error`. The
 * tracker keeps each launch's op independent, so concurrent launches never overwrite one another.
 */

const statuses = (entries: Record<string, SessionLaunchState | undefined>) =>
  new Map<string, SessionLaunchState | undefined>(Object.entries(entries));

describe('concurrent launches are tracked per worktree (no single-op overwrite)', () => {
  it('an async-failed launch still reads error after a LATER launch became the last action', () => {
    // The user starts launch A, then starts launch B before A settles (B is the LAST action).
    let t = noLaunchTracking;
    t = trackLaunch(t, 'a--0000');
    t = trackLaunch(t, 'b--1111');

    // Both launch ops are polled independently; A then FAILS asynchronously while B still starts.
    const ops = statuses({ 'a--0000': 'error', 'b--1111': 'starting' });
    t = settleLaunch(t, 'a--0000', 'error'); // A reached a terminal error → retained for its row.

    // A's op is NOT lost to B's later launch: its plug must derive `error`, never liveness-only off.
    expect(launchOpFor(t, ops, 'a--0000')).toBe('error');
    expect(
      deriveSessionStatus({
        live: false,
        pending: false,
        failed: false,
        launchOp: launchOpFor(t, ops, 'a--0000'),
      }),
    ).toBe('error');

    // B is tracked independently and still starting.
    expect(launchOpFor(t, ops, 'b--1111')).toBe('starting');
    expect(
      deriveSessionStatus({
        live: false,
        pending: false,
        failed: false,
        launchOp: launchOpFor(t, ops, 'b--1111'),
      }),
    ).toBe('starting');

    expect(trackedLaunchIds(t).sort()).toEqual(['a--0000', 'b--1111']);
  });

  it('a launch op governs ONLY the worktree it tracks (an untracked worktree reads undefined)', () => {
    const t = trackLaunch(noLaunchTracking, 'a--0000');
    const ops = statuses({ 'a--0000': 'starting', 'b--1111': 'error' });
    expect(launchOpFor(t, ops, 'a--0000')).toBe('starting');
    // B is not tracked → its (stale) op never leaks into B's plug.
    expect(launchOpFor(t, ops, 'b--1111')).toBeUndefined();
  });
});

describe('settleLaunch retires terminal ops correctly', () => {
  it('retains a terminal error so the row stays error until the user acts', () => {
    let t = trackLaunch(noLaunchTracking, 'a--0000');
    t = settleLaunch(t, 'a--0000', 'error');
    expect(trackedLaunchIds(t)).toContain('a--0000');
    expect(launchOpFor(t, statuses({ 'a--0000': 'error' }), 'a--0000')).toBe('error');
  });

  it('drops a ready op so the plug defers to tmux liveness', () => {
    let t = trackLaunch(noLaunchTracking, 'a--0000');
    t = settleLaunch(t, 'a--0000', 'ready');
    expect(trackedLaunchIds(t)).not.toContain('a--0000');
    expect(launchOpFor(t, statuses({ 'a--0000': 'ready' }), 'a--0000')).toBeUndefined();
  });

  it('drops an aborted op (defers to liveness, like ready)', () => {
    let t = trackLaunch(noLaunchTracking, 'a--0000');
    t = settleLaunch(t, 'a--0000', 'aborted');
    expect(trackedLaunchIds(t)).not.toContain('a--0000');
  });

  it('keeps tracking a still-starting op (keep polling)', () => {
    let t = trackLaunch(noLaunchTracking, 'a--0000');
    t = settleLaunch(t, 'a--0000', 'starting');
    expect(trackedLaunchIds(t)).toContain('a--0000');
  });
});

describe('stop / relaunch clears a row’s tracking', () => {
  it('untrackLaunch removes a single row without disturbing the others', () => {
    let t = noLaunchTracking;
    t = trackLaunch(t, 'a--0000');
    t = trackLaunch(t, 'b--1111');
    t = untrackLaunch(t, 'a--0000'); // a stop supersedes A's tracked launch op.
    expect(trackedLaunchIds(t)).toEqual(['b--1111']);
    expect(launchOpFor(t, statuses({ 'a--0000': 'starting' }), 'a--0000')).toBeUndefined();
  });

  it('relaunching a row in terminal error keeps it tracked and reads its FRESH op (not the stale error)', () => {
    // A errored, then the user relaunches it. The row stays tracked; once its status query is reset
    // and re-polls `starting`, the plug re-enters starting rather than sticking on the cached error.
    let t = trackLaunch(noLaunchTracking, 'a--0000');
    t = settleLaunch(t, 'a--0000', 'error');
    t = trackLaunch(t, 'a--0000'); // relaunch — idempotent re-track.
    expect(trackedLaunchIds(t)).toEqual(['a--0000']);
    expect(launchOpFor(t, statuses({ 'a--0000': 'starting' }), 'a--0000')).toBe('starting');
  });
});
